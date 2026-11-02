import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { preloadUser } from "@/lib/lms/cache";

/**
 * Background refresh of one student's LMS data, scheduled by a view when its
 * copy is stale. The page has already rendered from the old copy; the next
 * navigation shows the new one. One refresh per student at a time.
 */

const running = new Map<string, Promise<void>>();

export async function refreshStudent(userId: string): Promise<void> {
  const [user] = await db().select({ email: users.email }).from(users).where(eq(users.id, userId));
  if (!user) return;
  await preloadUser(userId, user.email);
}

/** Runs `refreshStudent` once per student, however many views ask. */
export function refreshOnce(userId: string): Promise<void> {
  const current = running.get(userId);
  if (current) return current;
  const job = refreshStudent(userId)
    .catch((error) => console.error("Background LMS refresh failed", error instanceof Error ? error.message : error))
    .finally(() => running.delete(userId));
  running.set(userId, job);
  return job;
}

/** After the response is sent (inside a request), or right away (cron, scripts, tests). */
export function scheduleRefresh(userId: string) {
  try {
    after(() => refreshOnce(userId));
  } catch {
    void refreshOnce(userId);
  }
}
