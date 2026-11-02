import { and, eq, inArray, sql } from "drizzle-orm";
import { askLevel, summarizeCourse, summarizeTeacher, validateRating, type RatingInput, type StoredRating, type TeacherRole } from "@/core/ratings";
import { db } from "@/lib/db";
import { courseRatings, ratingAsks, teacherRatings } from "@/lib/db/schema";
import { pseudonym } from "./identity";

export class RatingError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid rating: ${issues.join(", ")}`);
  }
}

/** Saves or replaces the student's rating of a course for a semester. */
export async function saveRating(userId: string, course: { id: string; code?: string | null }, term: string, input: RatingInput) {
  const issues = validateRating(input);
  if (issues.length) throw new RatingError(issues);
  const rater = pseudonym(userId, "rater");
  return db().transaction(async (tx) => {
    const values = { rater, courseId: course.id, courseCode: course.code ?? null, term, recommend: input.recommend!, hours: input.hours, difficulty: input.difficulty, tags: input.tags };
    const [row] = await tx
      .insert(courseRatings)
      .values(values)
      .onConflictDoUpdate({ target: [courseRatings.rater, courseRatings.courseId, courseRatings.term], set: { ...values, updatedAt: new Date() } })
      .returning({ id: courseRatings.id });
    await tx.delete(teacherRatings).where(eq(teacherRatings.ratingId, row.id));
    if (input.teachers.length) {
      await tx.insert(teacherRatings).values(input.teachers.map((t) => ({ ratingId: row.id, teacherId: t.teacherId, role: t.role, pressF: t.pressF, tags: t.tags })));
    }
    return row.id;
  });
}

type Row = typeof courseRatings.$inferSelect;

async function withTeachers(rows: Row[]): Promise<StoredRating[]> {
  if (!rows.length) return [];
  const answers = await db().select().from(teacherRatings).where(inArray(teacherRatings.ratingId, rows.map((r) => r.id)));
  const by = new Map<string, typeof answers>();
  for (const a of answers) by.set(a.ratingId, [...(by.get(a.ratingId) ?? []), a]);
  return rows.map((r) => ({
    courseId: r.courseId,
    term: r.term,
    recommend: r.recommend,
    hours: (r.hours as StoredRating["hours"]) ?? null,
    difficulty: (r.difficulty as StoredRating["difficulty"]) ?? null,
    tags: r.tags as StoredRating["tags"],
    teachers: (by.get(r.id) ?? []).map((a) => ({ teacherId: a.teacherId, role: a.role as TeacherRole, pressF: a.pressF, tags: a.tags as StoredRating["teachers"][number]["tags"] })),
  }));
}

export async function courseSummary(courseId: string) {
  const rows = await db().select().from(courseRatings).where(eq(courseRatings.courseId, courseId));
  return summarizeCourse(await withTeachers(rows));
}

export async function teacherSummary(teacherId: string) {
  const ids = db().select({ id: teacherRatings.ratingId }).from(teacherRatings).where(eq(teacherRatings.teacherId, teacherId));
  const rows = await db().select().from(courseRatings).where(inArray(courseRatings.id, ids));
  return summarizeTeacher(teacherId, await withTeachers(rows));
}

/** The student's own ratings, newest first ("My ratings"). */
export async function myRatings(userId: string) {
  const rows = await db().select().from(courseRatings).where(eq(courseRatings.rater, pseudonym(userId, "rater"))).orderBy(sql`${courseRatings.updatedAt} desc`);
  return withTeachers(rows);
}

/** "courseId|term" keys the student has rated, for the rate queue. */
export async function ratedKeys(userId: string) {
  const rows = await db().select({ courseId: courseRatings.courseId, term: courseRatings.term }).from(courseRatings).where(eq(courseRatings.rater, pseudonym(userId, "rater")));
  return new Set(rows.map((r) => `${r.courseId}|${r.term}`));
}

export async function dismissAsk(userId: string, term: string) {
  await db()
    .insert(ratingAsks)
    .values({ userId, term, dismissals: 1, lastDismissedAt: new Date() })
    .onConflictDoUpdate({ target: [ratingAsks.userId, ratingAsks.term], set: { dismissals: sql`${ratingAsks.dismissals} + 1`, lastDismissedAt: new Date() } });
}

export async function askFor(userId: string, term: string, waiting: number, daysSinceGrades: number) {
  const [row] = await db().select().from(ratingAsks).where(and(eq(ratingAsks.userId, userId), eq(ratingAsks.term, term)));
  return askLevel(waiting, row?.dismissals ?? 0, daysSinceGrades);
}
