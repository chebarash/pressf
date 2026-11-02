import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { cleanTitle } from "@/core/files";
import { displayName } from "@/core/people";
import { db } from "@/lib/db";
import { lmsCourses, lmsFiles, lmsTeachers, uploads } from "@/lib/db/schema";
import type { Viewer } from "./courses";
import { ratingsByCode, recommendOf } from "./shared";

/** Search (Figma 7.1–7.3): courses, people and files in one read. Files only for signed-in viewers. */

export type SearchView = {
  q: string;
  courses: Array<{ code: string; name: string; recommendPct: number | null; href: string }>;
  people: Array<{ id: string; name: string; position: string | null; href: string }>;
  files: Array<{ id: string; title: string; course: string; href: string }>;
  /** Typed something and found nothing (Figma 7.3). */
  nothing: boolean;
};

const words = (q: string) => q.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[%_\\]/g, " ").split(/\s+/).filter(Boolean).slice(0, 5);

export async function search(q: string, viewer: Viewer, limits = { courses: 5, people: 4, files: 4 }): Promise<SearchView> {
  const query = q.trim().slice(0, 80);
  const ws = words(query);
  if (!ws.length) return { q: query, courses: [], people: [], files: [], nothing: false };
  const like = (w: string) => `%${w}%`;
  const codeQuery = query.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const [courseRows, people, lms, live] = await Promise.all([
    db()
      .selectDistinctOn([lmsCourses.code], { code: lmsCourses.code, name: lmsCourses.name })
      .from(lmsCourses)
      .where(and(...ws.map((w) => or(ilike(lmsCourses.name, like(w)), ilike(lmsCourses.code, like(w.replace(/\s/g, "")))))))
      .orderBy(lmsCourses.code, sql`${lmsCourses.semesterId} desc nulls last`)
      .limit(40),
    db()
      .select()
      .from(lmsTeachers)
      .where(and(...ws.map((w) => or(ilike(lmsTeachers.firstName, like(w)), ilike(lmsTeachers.lastName, like(w))))))
      .limit(limits.people),
    viewer
      ? db().select({ id: lmsFiles.id, name: lmsFiles.name, code: lmsFiles.code }).from(lmsFiles).where(and(...ws.map((w) => or(ilike(lmsFiles.name, like(w)), ilike(lmsFiles.code, like(w)))))).limit(limits.files)
      : Promise.resolve([]),
    viewer
      ? db().select({ id: uploads.id, title: uploads.title, code: uploads.courseCode }).from(uploads).where(and(eq(uploads.status, "live"), ...ws.map((w) => or(ilike(uploads.title, like(w)), ilike(uploads.courseCode, like(w)))))).limit(limits.files)
      : Promise.resolve([]),
  ]);

  // Exact code hits first, then names starting with the query, then the rest.
  const lower = query.toLowerCase();
  const rank = (c: { code: string; name: string }) => (c.code === codeQuery ? 0 : c.name.toLowerCase().startsWith(lower) ? 1 : 2);
  const courses = courseRows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, limits.courses);
  const fileCodes = [...new Set([...lms.map((f) => f.code), ...live.map((u) => u.code ?? "")].filter(Boolean))];
  const [ratings, fileCourses] = await Promise.all([
    ratingsByCode(courses.map((c) => c.code)),
    fileCodes.length ? db().selectDistinctOn([lmsCourses.code], { code: lmsCourses.code, name: lmsCourses.name }).from(lmsCourses).where(inArray(lmsCourses.code, fileCodes)) : Promise.resolve([]),
  ]);
  const courseName = new Map(fileCourses.map((c) => [c.code, c.name]));

  const view: SearchView = {
    q: query,
    courses: courses.map((c) => ({ code: c.code, name: c.name, recommendPct: recommendOf(ratings[c.code]), href: `/c/${c.code}` })),
    people: people.map((t) => ({ id: t.id, name: displayName({ first_name_en: t.firstName, last_name_en: t.lastName }), position: t.position, href: `/p/${t.id}` })),
    files: [
      ...live.map((u) => ({ id: u.id, title: u.title, course: courseName.get(u.code ?? "") ?? u.code ?? "", href: `/f/${u.id}` })),
      ...lms.map((f) => ({ id: f.id, title: cleanTitle(f.name, { courseCode: f.code, courseName: courseName.get(f.code) }), course: courseName.get(f.code) ?? f.code, href: `/f/${f.id}` })),
    ].slice(0, limits.files),
    nothing: false,
  };
  view.nothing = !view.courses.length && !view.people.length && !view.files.length;
  return view;
}
