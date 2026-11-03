"use server";

import { eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { lmsAccounts, lmsCache, users } from "@/lib/db/schema";

/** Whether the student already has a snapshot (else the first sync runs, 1.7). */
export async function hasSnapshot() {
  const user = await getUser();
  if (!user) return false;
  const [row] = await db().select({ userId: lmsCache.userId }).from(lmsCache).where(eq(lmsCache.userId, user.id));
  return !!row;
}

/**
 * Sign out (8.2): Press F forgets the sealed LMS password and the cached
 * snapshot; ratings stay. The client then clears the session cookie.
 */
export async function forgetLms() {
  const user = await getUser();
  if (!user) return;
  await db().delete(lmsAccounts).where(eq(lmsAccounts.userId, user.id));
  await db().delete(lmsCache).where(eq(lmsCache.userId, user.id));
  await db().update(users).set({ telegramId: null }).where(eq(users.id, user.id));
}
