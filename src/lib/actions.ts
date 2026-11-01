"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser, requireAdmin } from "@/lib/auth";
import { getCatalog, findTeacher } from "@/lib/catalog";
import { db } from "@/lib/db";
import { courseOverrides, ratings, respects, users, type SyllabusData } from "@/lib/db/schema";

const Score = z.number().int().min(1).max(5);
const RateInput = z.object({ teacherId: z.string(), courseCode: z.string(), clarity: Score, engagement: Score, organization: Score, expertise: Score, fairGrading: Score });

export async function rateTeacher(input: unknown) {
  const user = await getUser();
  if (!user) return { error: "signin" as const };
  const value = RateInput.parse(input);
  const catalog = await getCatalog();
  const teacher = findTeacher(catalog, value.teacherId);
  if (!teacher || !teacher.teaches.includes(value.courseCode)) return { error: "invalid" as const };
  const overall = (value.clarity + value.engagement + value.organization + value.expertise + value.fairGrading) / 5;
  const row = { ...value, overall, userId: user.id, updatedAt: new Date() };
  await db().insert(ratings).values(row).onConflictDoUpdate({ target: [ratings.userId, ratings.teacherId, ratings.courseCode], set: row });
  revalidatePath(`/professors/${value.teacherId}`);
  revalidatePath(`/courses/${value.courseCode}`);
  revalidatePath("/me/ratings");
  return { ok: true as const };
}

export async function payRespect(teacherId: string) {
  const user = await getUser();
  if (!user) return { error: "signin" as const };
  await db().insert(respects).values({ userId: user.id, teacherId }).onConflictDoNothing();
  revalidatePath(`/professors/${teacherId}`);
  return { ok: true as const };
}

export async function chooseGroup(formData: FormData) {
  const group = String(formData.get("group") ?? "");
  const { groups } = await getCatalog();
  if (!groups.some((item) => item.class === group)) return;
  (await cookies()).set("group", group, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/" });
  const user = await getUser();
  if (user) await db().update(users).set({ group }).where(eq(users.id, user.id));
  redirect("/");
}

export async function deleteRating(teacherId: string, courseCode: string) {
  const user = await getUser();
  if (!user) return;
  await db().delete(ratings).where(and(eq(ratings.userId, user.id), eq(ratings.teacherId, teacherId), eq(ratings.courseCode, courseCode)));
  revalidatePath("/me/ratings");
}

export async function saveOverride(code: string, patch: Partial<SyllabusData>) {
  await requireAdmin();
  await db().insert(courseOverrides).values({ code, data: patch }).onConflictDoUpdate({
    target: courseOverrides.code, set: { data: patch, updatedAt: new Date() },
  });
  revalidatePath(`/courses/${code}`);
}
