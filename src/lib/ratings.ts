import { avg, count, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { ratings, respects } from "@/lib/db/schema";

export { CRITERIA } from "./criteria";

export type Rating = { overall: number; clarity: number; engagement: number; organization: number; expertise: number; fairGrading: number; count: number };
export type Tier = "High" | "Mid" | "Low" | "None";

export const tierOf = (score: number | null | undefined): Tier =>
  score == null ? "None" : score >= 3.7 ? "High" : score >= 3 ? "Mid" : "Low";

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

export const respectCount = cache(async (teacherId: string) => {
  const [row] = await db().select({ value: count() }).from(respects).where(eq(respects.teacherId, teacherId));
  return row.value;
});

export const userRatings = (userId: string) =>
  db().select().from(ratings).where(eq(ratings.userId, userId)).orderBy(sql`${ratings.updatedAt} desc`);
