import { and, eq } from "drizzle-orm";
import { cache } from "react";
import { normalizeCode, type Catalog, type Course } from "@/lib/catalog";
import { db } from "@/lib/db";
import { courseOverrides, syllabi, type SyllabusData } from "@/lib/db/schema";
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
