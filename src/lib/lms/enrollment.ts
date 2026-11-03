import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { lmsCourses } from "@/lib/db/schema";
import { myList } from "@/lib/lms/client";
import { sessionFor } from "@/lib/lms/store";
import { termName } from "@/server/sync/types";

/**
 * The signed-in student's current semester, read live from the LMS: the courses
 * they are actually enrolled in now. This replaces the manual group picker —
 * we no longer guess a student's courses from a class label.
 */

export type Enrollment = {
  semesterName: string | null;
  codes: string[];
  courses: Array<{ code: string; subject: string }>;
};

export async function studentSemester(userId: string): Promise<Enrollment | null> {
  const session = await sessionFor(userId);
  if (!session) return null;
  const list = await myList(session).catch(() => null);
  if (!list) return null;

  // is_open: "0" past, "1" current, "2" upcoming. Prefer the open one, else the latest.
  const semesters = list.semesters ?? [];
  const current = semesters.find((s) => s.is_open === "1") ?? [...semesters].reverse().find((s) => s.subjects?.length);
  if (!current) return { semesterName: null, codes: [], courses: [] };

  const subjectIds = [...new Set((current.subjects ?? []).map((s) => s.subject_id).filter(Boolean))];
  const rows = subjectIds.length
    ? await db().select({ id: lmsCourses.id, code: lmsCourses.code, name: lmsCourses.name }).from(lmsCourses).where(inArray(lmsCourses.id, subjectIds))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const courses = subjectIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ code: r.code, subject: r.name }));

  return { semesterName: current.name ? termName(current.name) || current.name : null, codes: courses.map((c) => c.code), courses };
}
