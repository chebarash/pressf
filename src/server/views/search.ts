import { eq, notInArray, sql } from "drizzle-orm";
import { cleanTitle } from "@/core/files";
import { displayName } from "@/core/people";
import { createIndex, type SearchIndex } from "@/core/search";
import { closest } from "@/core/suggest";
import { db } from "@/lib/db";
import { faces, fileOverrides, lmsCourses, lmsCurricula, lmsFiles, lmsPrograms, lmsTeachers, teacherAliases, uploads } from "@/lib/db/schema";
import { onInvalidate } from "./cache";
import type { Viewer } from "./courses";
import { faceUrl, ratingsByCode, recommendOf } from "./shared";

/**
 * Search (Figma 7.1–7.3, D14, the ⌘K palette): courses, professors, programs and
 * files in one read, ranked by `@/core/search`. Files only for signed-in viewers.
 *
 * The catalog is small, so it is indexed in memory once and reused: a search
 * touches no table except the cached rating summaries of the courses it returns.
 * The index rebuilds in the background every few minutes and right away when a
 * harvest, upload or admin edit invalidates public data. No LMS calls.
 */

export type SearchView = {
  q: string;
  courses: Array<{ code: string; name: string; recommendPct: number | null; href: string }>;
  /** `face`: drawn face URL, null when none is assigned. */
  people: Array<{ id: string; name: string; position: string | null; face: string | null; href: string }>;
  programs: Array<{ id: string; name: string; href: string }>;
  files: Array<{ id: string; title: string; course: string; href: string }>;
  /** Typed something and found nothing (Figma 7.3). */
  nothing: boolean;
  /** When nothing is found: the course name closest to a typo ("calculas" → "Calculus 1"), Figma D17. */
  didYouMean?: string | null;
};

export type SearchLimits = { courses: number; people: number; files: number; programs?: number };

type Course = { code: string; name: string };
type Person = { id: string; name: string; position: string | null; face: string | null };
type Program = { id: string; name: string };
type File = { id: string; title: string; code: string; live: boolean };

type Catalog = { courses: SearchIndex<Course>; people: SearchIndex<Person>; programs: SearchIndex<Program>; courseName: Map<string, string>; names: string[] };

async function buildCatalog(): Promise<Catalog> {
  const [courses, people, programs] = await Promise.all([
    db()
      .selectDistinctOn([lmsCourses.code], { code: lmsCourses.code, name: lmsCourses.name })
      .from(lmsCourses)
      .orderBy(lmsCourses.code, sql`${lmsCourses.semesterId} desc nulls last`),
    db()
      .select({ id: lmsTeachers.id, firstName: lmsTeachers.firstName, lastName: lmsTeachers.lastName, position: lmsTeachers.position, faceAt: faces.updatedAt })
      .from(lmsTeachers)
      .leftJoin(faces, eq(faces.teacherId, lmsTeachers.id))
      // A professor merged into another keeps only the surviving page.
      .where(notInArray(lmsTeachers.id, db().select({ id: teacherAliases.oldId }).from(teacherAliases))),
    db()
      .select({ id: lmsPrograms.id, name: lmsPrograms.name })
      .from(lmsPrograms)
      .where(sql`exists (select 1 from ${lmsCurricula} where ${lmsCurricula.programId} = ${lmsPrograms.id})`),
  ]);
  const courseName = new Map(courses.map((c) => [c.code, c.name]));
  return {
    courses: createIndex(courses.map((c) => ({ item: c, text: c.name, code: c.code }))),
    people: createIndex(
      people.map((t) => {
        const name = displayName({ first_name_en: t.firstName, last_name_en: t.lastName });
        return { item: { id: t.id, name, position: t.position, face: t.faceAt ? faceUrl(t.id, t.faceAt) : null }, text: name };
      }),
      { names: true },
    ),
    programs: createIndex(programs.filter((p) => p.name).map((p) => ({ item: { id: p.id, name: p.name! }, text: p.name! }))),
    courseName,
    names: [...new Set(courses.map((c) => c.name))],
  };
}

async function buildFiles(courseName: Map<string, string>): Promise<SearchIndex<File>> {
  const [lms, live] = await Promise.all([
    // Admin renames are searchable; hidden files are not.
    db()
      .select({ id: lmsFiles.id, name: lmsFiles.name, code: lmsFiles.code, title: fileOverrides.title })
      .from(lmsFiles)
      .leftJoin(fileOverrides, eq(fileOverrides.fileId, lmsFiles.id))
      .where(sql`coalesce(${fileOverrides.hidden}, false) = false`),
    db().select({ id: uploads.id, title: uploads.title, code: uploads.courseCode }).from(uploads).where(eq(uploads.status, "live")),
  ]);
  const docs = [
    ...live.map((u) => ({ id: u.id, title: u.title, code: u.code ?? "", live: true })),
    ...lms.map((f) => ({ id: f.id, title: f.title?.trim() || cleanTitle(f.name, { courseCode: f.code, courseName: courseName.get(f.code) }), code: f.code, live: false })),
  ];
  // Student uploads first among equals: they are the reviewed, named copies.
  return createIndex(docs.map((f) => ({ item: f, text: f.title, extra: `${f.code} ${courseName.get(f.code) ?? ""}`, boost: f.live ? 0.1 : 0 })));
}

/* ───────────── in-memory index ───────────── */

const FRESH_MS = 5 * 60_000;
type Slot<T> = { at: number; value: Promise<T> } | null;
let catalogSlot: Slot<Catalog> = null;
let filesSlot: Slot<SearchIndex<File>> = null;

const uncached = () => !!process.env.VITEST || process.env.NODE_ENV === "test";

/** Fresh: reuse. Stale: serve the old index and rebuild behind it. Dropped (invalidated) or failed: rebuild now. */
function cached<T>(slot: Slot<T>, set: (s: Slot<T>) => void, build: () => Promise<T>): Promise<T> {
  const now = Date.now();
  if (slot && now - slot.at < FRESH_MS) return slot.value;
  const next = { at: now, value: build() };
  next.value.catch(() => set(null));
  if (slot) {
    // Keep serving the previous index until the new one is ready.
    next.value.then(() => set(next), () => {});
    slot.at = now;
    return slot.value;
  }
  set(next);
  return next.value;
}

function catalogIndex(): Promise<Catalog> {
  if (uncached()) return buildCatalog();
  return cached(catalogSlot, (s) => (catalogSlot = s), buildCatalog);
}

async function filesIndex(): Promise<SearchIndex<File>> {
  if (uncached()) return buildFiles((await buildCatalog()).courseName);
  return cached(filesSlot, (s) => (filesSlot = s), async () => buildFiles((await catalogIndex()).courseName));
}

/** Drops the in-memory index; the next search rebuilds it. Runs on every public-data invalidation. */
export function resetSearchIndex() {
  catalogSlot = null;
  filesSlot = null;
}
onInvalidate(resetSearchIndex);

/* ───────────── the view ───────────── */

export async function search(q: string, viewer: Viewer, limits: SearchLimits = { courses: 5, people: 4, files: 4, programs: 3 }): Promise<SearchView> {
  const query = q.trim().slice(0, 80);
  const empty: SearchView = { q: query, courses: [], people: [], programs: [], files: [], nothing: false };
  if (!query || !/[\p{L}\p{N}]/u.test(query)) return empty;

  const [catalog, files] = await Promise.all([catalogIndex(), viewer && limits.files > 0 ? filesIndex() : Promise.resolve(null)]);
  const courses = catalog.courses.search(query, limits.courses).map((h) => h.item);
  const people = catalog.people.search(query, limits.people).map((h) => h.item);
  const programs = catalog.programs.search(query, limits.programs ?? 0).map((h) => h.item);
  const fileHits = files ? files.search(query, limits.files).map((h) => h.item) : [];
  const ratings = courses.length ? await ratingsByCode(courses.map((c) => c.code)) : {};

  const view: SearchView = {
    q: query,
    courses: courses.map((c) => ({ code: c.code, name: c.name, recommendPct: recommendOf(ratings[c.code]), href: `/c/${c.code}` })),
    people: people.map((p) => ({ ...p, href: `/p/${p.id}` })),
    programs: programs.map((p) => ({ id: p.id, name: p.name, href: `/programs/${encodeURIComponent(p.id)}/curriculum` })),
    files: fileHits.map((f) => ({ id: f.id, title: f.title, course: catalog.courseName.get(f.code) ?? f.code, href: `/f/${f.id}` })),
    nothing: false,
  };
  view.nothing = !view.courses.length && !view.people.length && !view.programs.length && !view.files.length;
  if (view.nothing) view.didYouMean = closest(query, catalog.names);
  return view;
}
