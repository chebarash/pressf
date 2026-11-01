import { and, desc, eq, gte, count, ilike, inArray } from "drizzle-orm";
import { cache } from "react";
import { getCatalog, normalizeCode, type Catalog, type Course, type Teacher } from "@/lib/catalog";
import { courseCertainty, teacherCertainty } from "@/lib/mention-match";
import { courseRatings } from "@/lib/ratings";
import { db } from "@/lib/db";
import { courseOverrides, faces, materials, mentionLinks, mentions, searchEvents, syllabi, type SyllabusData } from "@/lib/db/schema";
import { termRank, titleKey } from "@/lib/syllabus";

export const courseSyllabi = cache(async (code: string) => {
  const rows = await db().select().from(syllabi).where(and(eq(syllabi.courseCode, code), eq(syllabi.matched, true)));
  return rows.sort((a, b) => termRank(b.data) - termRank(a.data));
});

/** The newest syllabus with admin edits on top. */
export const courseDetails = cache(async (code: string) => {
  const [versions, override] = await Promise.all([
    courseSyllabi(code),
    db().select().from(courseOverrides).where(eq(courseOverrides.code, code)),
  ]);
  if (!versions.length) return null;
  return { data: { ...versions[0].data, ...override[0]?.data } as SyllabusData, versions };
});

export const faceMap = cache(async () => {
  const rows = await db().select().from(faces);
  return new Map(rows.map((row) => [row.teacherId, `/faces/${row.teacherId}`]));
});

export const fileCounts = cache(async () => {
  const rows = await db().select({ code: materials.courseCode, value: count() }).from(materials).where(eq(materials.status, "approved")).groupBy(materials.courseCode);
  return new Map(rows.map((row) => [row.code, row.value]));
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What a course card shows: who teaches it and how much there is to read. */
export async function courseCards(list: Course[], catalog: Catalog) {
  const [scores, counts, photos] = await Promise.all([courseRatings(), fileCounts(), faceMap()]);
  const names = new Map(catalog.teachers.map((t) => [t.id, t.display_name]));
  return list.map((course) => {
    const files = counts.get(course.code) ?? 0;
    return {
      code: course.code, name: course.subject, score: scores.get(course.code)?.overall,
      meta: [course.teachers.length ? plural(course.teachers.length, "teacher") : "Not in this term's timetable", files ? plural(files, "file") : null].filter(Boolean).join(" · "),
      faces: course.teachers.slice(0, 2).map((id) => ({ name: names.get(id) ?? "", src: photos.get(id) })),
    };
  });
}

export const teacherCourses = (teacher: Teacher, catalog: Catalog) =>
  teacher.teaches.flatMap((code) => catalog.courses.find((course) => course.code === code)?.subject ?? []).slice(0, 3);

export const publishedFiles = cache(async (code?: string) => {
  const where = code ? and(eq(materials.status, "approved"), eq(materials.courseCode, code)) : eq(materials.status, "approved");
  return db().select().from(materials).where(where).orderBy(desc(materials.publishedAt)).limit(500);
});

/** A file anyone may download: approved, and stored. */
export async function publishedFile(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [file] = await db().select().from(materials).where(eq(materials.id, id));
  return file?.storageKey && file.status === "approved" ? file : null;
}

export type MentionSubject = { kind: "course"; course: Course } | { kind: "teacher"; teacher: Teacher };

/** Every post linked to a course or person: sure matches first, then newest. */
export async function mentionsFor(subject: MentionSubject, sort: "best" | "new" = "best") {
  const target = subject.kind === "course" ? subject.course.code : subject.teacher.id;
  const rows = await db().selectDistinct({ postId: mentions.postId, url: mentions.url, text: mentions.text, date: mentions.date })
    .from(mentions).innerJoin(mentionLinks, eq(mentionLinks.postId, mentions.postId))
    .where(and(eq(mentionLinks.kind, subject.kind), eq(mentionLinks.target, target)));
  const certainty = (text: string) => subject.kind === "course" ? courseCertainty(text, subject.course) : teacherCertainty(text, subject.teacher);
  const rated = rows.map((row) => ({ ...row, certainty: certainty(row.text) }));
  const rank = (row: (typeof rated)[number]) => (sort === "best" && row.certainty === "possible" ? 1 : 0);
  return rated.sort((a, b) => rank(a) - rank(b) || b.postId - a.postId);
}

/** The latest posts about any of these courses. */
export async function postsAboutCourses(codes: string[], limit: number) {
  if (!codes.length) return [];
  return db().selectDistinct({ postId: mentions.postId, url: mentions.url, text: mentions.text, date: mentions.date }).from(mentions)
    .innerJoin(mentionLinks, eq(mentionLinks.postId, mentions.postId))
    .where(and(eq(mentionLinks.kind, "course"), inArray(mentionLinks.target, codes))).orderBy(desc(mentions.postId)).limit(limit);
}

/** The whole channel, newest first. */
export async function channelPosts(query: string, limit: number, offset = 0) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const where = and(...words.map((word) => ilike(mentions.text, `%${word.replace(/[%_]/g, "")}%`)));
  const [items, [{ total }]] = await Promise.all([
    db().select().from(mentions).where(where).orderBy(desc(mentions.postId)).limit(limit).offset(offset),
    db().select({ total: count() }).from(mentions).where(where),
  ]);
  return { items, total };
}

export type Requirement = { text: string; code: string | null };

/** Names in syllabi become catalog links only when exactly one course fits. */
export function resolveRequirement(item: { text: string; code: string }, courses: Course[]): Requirement {
  const code = normalizeCode(item.code || item.text.match(/[A-Za-z]{2,5}\s?-?\d{3,4}/)?.[0] || "");
  if (code && courses.some((course) => course.code === code)) return { text: item.text, code };
  const key = titleKey(item.text);
  const hits = courses.filter((course) => titleKey(course.subject) === key);
  return { text: item.text, code: hits.length === 1 ? hits[0].code : null };
}

/** Which courses list this one as a requirement. */
export const unlocks = cache(async (code: string, catalog: Catalog) => {
  const rows = await db().select().from(syllabi).where(eq(syllabi.matched, true));
  const found = new Set<string>();
  for (const row of rows) {
    if (row.courseCode === code) continue;
    const items = row.data.prerequisites.groups.flatMap((group) => group.any_of);
    if (items.some((item) => resolveRequirement(item, catalog.courses).code === code)) found.add(row.courseCode);
  }
  return catalog.courses.filter((course) => found.has(course.code));
});

export function programsWith(code: string, catalog: Catalog) {
  return catalog.schools.flatMap((school) => school.programs).filter((program) =>
    catalog.curricula[program.slug]?.semesters.some((semester) => semester.courses.some((course) => course.code === code))
  );
}

export function schoolOfCourse(code: string, catalog: Catalog) {
  return catalog.schools.filter((school) => school.programs.some((program) =>
    catalog.curricula[program.slug]?.semesters.some((semester) => semester.courses.some((course) => course.code === code))
  ));
}

/** Most opened from search this week; falls back to the busiest courses. */
export async function popularCourses(catalog: Catalog, limit = 3) {
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const rows = await db().select({ id: searchEvents.targetId, value: count() }).from(searchEvents)
    .where(and(eq(searchEvents.kind, "Course"), gte(searchEvents.createdAt, weekAgo)))
    .groupBy(searchEvents.targetId).orderBy(desc(count())).limit(limit);
  const picked = rows.map((row) => catalog.courses.find((course) => course.code === row.id)).filter((c): c is Course => !!c);
  const rest = [...catalog.courses].sort((a, b) => b.classes.length - a.classes.length);
  return [...picked, ...rest.filter((c) => !picked.includes(c))].slice(0, limit);
}

export const teacherLine = (teacher: { department: string | null; teaches: string[] }) =>
  [teacher.department, teacher.teaches.length ? `${teacher.teaches.length} ${teacher.teaches.length === 1 ? "course" : "courses"}` : null].filter(Boolean).join(" · ") || "Staff";
