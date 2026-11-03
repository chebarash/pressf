import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { teacherNamesByCode } from "@/server/views/shared";
import { describeFile, type FileType } from "@/core/files";
import { roleOf } from "@/core/people";
import { shortDate } from "@/core/time";
import { db } from "@/lib/db";
import { courseRatings, fileOverrides, lmsCourseTeachers, lmsCourses, lmsFiles, searchEvents, uploads } from "@/lib/db/schema";
import { DECISION_TAGS, overlay } from "@/server/decisions";
import { publicCache, TAGS } from "./cache";
import { schools, type SchoolsView } from "./curriculum";
import { ratingsByCode, recommendOf, teachersByIds } from "./shared";

/** The home for someone not signed in (Figma 1.2): popular courses, fresh files, schools. Public and cached. */

export type GuestCourse = {
  code: string;
  name: string;
  recommendPct: number | null;
  href: string;
  /** The course's lecturer; `face` is the drawn face URL or null. */
  teacher: { id: string; name: string; face: string | null } | null;
  /** "≈ 6 h/wk · Hard-ish" from 5 ratings, else null. */
  line: string | null;
};

/** Titles and course only: guests never get the file itself. */
export type GuestFile = {
  id: string;
  title: string;
  type: FileType;
  course: string;
  /** "2 Nov". */
  date: string | null;
  source: { label: string; kind: "lms" | "channel" | "student" };
  href: string;
};

export type GuestHomeView = { guest: true; schools: SchoolsView["schools"]; popular: GuestCourse[]; freshFiles: GuestFile[] };

const POPULAR = 5;
const FRESH = 5;
const POPULAR_DAYS = 30;

/** Most-opened course codes in the last 30 days; most-rated courses fill in when there are few opens. */
async function popularCodes(now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - POPULAR_DAYS * 86_400_000);
  const n = count();
  const opened = await db()
    .select({ code: sql<string>`upper(${searchEvents.targetId})`, n })
    .from(searchEvents)
    .where(and(inArray(sql`lower(${searchEvents.kind})`, ["course"]), gte(searchEvents.createdAt, since)))
    .groupBy(sql`upper(${searchEvents.targetId})`)
    .orderBy(desc(n))
    .limit(POPULAR * 3);
  const codes = opened.map((r) => r.code);
  if (codes.length < POPULAR) {
    const rn = count();
    const code = sql<string>`coalesce(${courseRatings.courseCode}, ${lmsCourses.code})`;
    const rated = await db().select({ code, n: rn }).from(courseRatings).leftJoin(lmsCourses, eq(lmsCourses.id, courseRatings.courseId)).groupBy(code).orderBy(desc(rn)).limit(POPULAR * 2);
    for (const r of rated) if (r.code && !codes.includes(r.code)) codes.push(r.code);
  }
  return codes;
}

async function popular(now: Date): Promise<GuestCourse[]> {
  const codes = await popularCodes(now);
  if (!codes.length) return [];
  const rows = await db().select({ id: lmsCourses.id, code: lmsCourses.code, name: lmsCourses.name, semesterId: lmsCourses.semesterId }).from(lmsCourses).where(inArray(lmsCourses.code, codes));
  const newest = new Map<string, (typeof rows)[number]>();
  for (const r of rows.sort((a, b) => Number(b.semesterId ?? 0) - Number(a.semesterId ?? 0))) if (!newest.has(r.code)) newest.set(r.code, r);
  const picked = codes.filter((c) => newest.has(c)).slice(0, POPULAR);
  if (!picked.length) return [];
  const ids = picked.map((c) => newest.get(c)!.id);
  const [links, ratings] = await Promise.all([db().select().from(lmsCourseTeachers).where(inArray(lmsCourseTeachers.courseId, ids)), ratingsByCode(picked)]);
  const lead = (id: string) => (links.find((l) => l.courseId === id && roleOf(l.role) === "lecture") ?? links.find((l) => l.courseId === id))?.teacherId ?? null;
  const people = await teachersByIds(ids.map(lead).filter((x): x is string => !!x));
  return picked.map((code) => {
    const row = newest.get(code)!;
    const t = people.get(lead(row.id) ?? "");
    const r = ratings[code];
    const line = r?.enough ? [r.hoursLabel, r.difficultyLabel].filter(Boolean).join(" · ") || null : null;
    return { code, name: row.name, recommendPct: recommendOf(r), href: `/c/${code}`, teacher: t ? { id: t.id, name: t.name, face: t.face } : null, line };
  });
}

async function freshFiles(): Promise<GuestFile[]> {
  const posted = sql<Date>`coalesce(${lmsFiles.lmsCreatedAt}, ${lmsFiles.lmsUpdatedAt}, ${lmsFiles.fetchedAt})`;
  const [lms, live] = await Promise.all([
    // Admin edits apply; hidden files are left out.
    db().select({ id: lmsFiles.id, name: lmsFiles.name, code: lmsFiles.code, extension: lmsFiles.extension, courseName: lmsCourses.name, at: posted, edit: { title: fileOverrides.title, type: fileOverrides.type, week: fileOverrides.week } })
      .from(lmsFiles).leftJoin(lmsCourses, eq(lmsCourses.id, lmsFiles.courseId)).leftJoin(fileOverrides, eq(fileOverrides.fileId, lmsFiles.id))
      .where(sql`coalesce(${fileOverrides.hidden}, false) = false`).orderBy(desc(posted)).limit(FRESH),
    db().select({ id: uploads.id, title: uploads.title, type: uploads.type, code: uploads.courseCode, courseName: lmsCourses.name, at: uploads.createdAt })
      .from(uploads).leftJoin(lmsCourses, eq(lmsCourses.id, uploads.courseId)).where(eq(uploads.status, "live")).orderBy(desc(uploads.createdAt)).limit(FRESH),
  ]);
  const people = await teacherNamesByCode();
  const items = [
    ...lms.map((f) => {
      const course = f.courseName ?? f.code;
      const d = describeFile(f.name, { courseCode: f.code, courseName: course, extension: f.extension ?? undefined, teachers: people[f.code ?? ""] });
      const meta = overlay({ title: d.title, type: d.type, week: null }, f.edit ? { ...f.edit, hidden: false } : null)!;
      return { at: new Date(f.at), item: { id: f.id, title: meta.title, type: meta.type, course, source: { label: "LMS", kind: "lms" as const }, href: `/f/${f.id}` } };
    }),
    ...live.map((u) => ({ at: u.at, item: { id: u.id, title: u.title, type: (u.type as FileType) ?? "other", course: u.courseName ?? u.code ?? "Course", source: { label: "Student", kind: "student" as const }, href: `/f/${u.id}` } })),
  ];
  return items
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, FRESH)
    .map(({ at, item }) => ({ ...item, date: Number.isNaN(at.getTime()) ? null : shortDate(at) }));
}

const guestPublic = publicCache(
  "guest-home",
  async (): Promise<Omit<GuestHomeView, "schools">> => {
    const [p, f] = await Promise.all([popular(new Date()), freshFiles()]);
    return { guest: true, popular: p, freshFiles: f };
  },
  () => [TAGS.catalog, TAGS.ratings, DECISION_TAGS.overrides],
  600,
);

/** Figma 1.2: the guest home in one read. */
export async function guestHome(): Promise<GuestHomeView> {
  const [pub, s] = await Promise.all([guestPublic(), schools()]);
  return { ...pub, schools: s.schools };
}
