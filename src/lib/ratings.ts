import { avg, count, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { ratings, respects } from "@/lib/db/schema";

export { CRITERIA, tierOf, type Tier } from "./criteria";

export type Rating = { overall: number; clarity: number; engagement: number; organization: number; expertise: number; fairGrading: number; count: number };

const fields = {
  overall: avg(ratings.overall), clarity: avg(ratings.clarity), engagement: avg(ratings.engagement),
  organization: avg(ratings.organization), expertise: avg(ratings.expertise), fairGrading: avg(ratings.fairGrading),
  count: count(),
};

const parse = (row: Record<string, string | number | null>): Rating => ({
  overall: Number(row.overall), clarity: Number(row.clarity), engagement: Number(row.engagement),
  organization: Number(row.organization), expertise: Number(row.expertise), fairGrading: Number(row.fairGrading),
  count: Number(row.count),
});

export const teacherRatings = cache(async () => {
  const rows = await db().select({ id: ratings.teacherId, ...fields }).from(ratings).groupBy(ratings.teacherId);
  return new Map(rows.map((row) => [row.id, parse(row)]));
});

export const courseRatings = cache(async () => {
  const rows = await db().select({ id: ratings.courseCode, ...fields }).from(ratings).groupBy(ratings.courseCode);
  return new Map(rows.map((row) => [row.id, parse(row)]));
});

export const respectCounts = cache(async () => {
  const rows = await db().select({ id: respects.teacherId, value: count() }).from(respects).groupBy(respects.teacherId);
  return new Map(rows.map((row) => [row.id, row.value]));
});

const STRENGTHS: Array<[keyof Rating, string]> = [["clarity", "Clear"], ["engagement", "Engaging"], ["organization", "Organized"], ["expertise", "Expert"], ["fairGrading", "Fair grading"]];

/** A teacher's two best criteria, shown only when students rate them highly. */
export const strengths = (rating?: Rating) =>
  rating ? STRENGTHS.filter(([key]) => rating[key] >= 4).sort((a, b) => rating[b[0]] - rating[a[0]]).slice(0, 2).map(([, label]) => label) : [];

export const respectCount = cache(async (teacherId: string) => {
  const [row] = await db().select({ value: count() }).from(respects).where(eq(respects.teacherId, teacherId));
  return row.value;
});

export const userRatings = (userId: string) =>
  db().select().from(ratings).where(eq(ratings.userId, userId)).orderBy(sql`${ratings.updatedAt} desc`);
