import { and, desc, eq, inArray, sql, gte, count } from "drizzle-orm";
import { cache } from "react";
import { getCatalog, normalizeCode, type Catalog, type Course } from "@/lib/catalog";
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

export const publishedFiles = cache(async (code?: string) => {
  const where = code ? and(eq(materials.status, "approved"), eq(materials.courseCode, code)) : eq(materials.status, "approved");
  return db().select().from(materials).where(where).orderBy(desc(materials.publishedAt)).limit(code ? 200 : 100);
});

export async function mentionsFor(kind: "course" | "teacher" | Array<string>, target?: string, limit = 3) {
  const targets = Array.isArray(kind) ? kind : [target!];
  const linkKind = Array.isArray(kind) ? "course" : kind;
  const where = and(eq(mentionLinks.kind, linkKind), inArray(mentionLinks.target, targets.length ? targets : [""]));
  const rows = await db().selectDistinct({ postId: mentions.postId, url: mentions.url, text: mentions.text, date: mentions.date })
    .from(mentions).innerJoin(mentionLinks, eq(mentionLinks.postId, mentions.postId)).where(where).orderBy(desc(mentions.postId)).limit(limit);
  const [{ total }] = await db().select({ total: sql<number>`count(distinct ${mentionLinks.postId})` }).from(mentionLinks).where(where);
  return { items: rows, total: Number(total) };
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
