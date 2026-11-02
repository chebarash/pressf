import { eq } from "drizzle-orm";
import type { Lesson } from "@/lib/catalog/types";
import { db } from "@/lib/db";
import { lmsCache } from "@/lib/db/schema";
import { studentSemester, type Enrollment } from "@/lib/lms/enrollment";
import { lmsProfile, type LmsProfile } from "@/lib/lms/profile";
import { studentTimetable } from "@/lib/lms/schedule";

/**
 * A student's LMS data, snapshotted at sign-in and refreshed in the background.
 * Pages read this cache so they never block on the slow LMS during a render.
 */
export type UserCache = { enrollment: Enrollment | null; timetable: Lesson[]; profile: LmsProfile | null };

/** Refresh at most this often in the background. */
export const CACHE_TTL_MS = 30 * 60 * 1000;

/** Fetch everything from the LMS and store it. Called at sign-in and on refresh. */
export async function preloadUser(userId: string, email: string): Promise<UserCache> {
  const [enrollment, timetable, profile] = await Promise.all([
    studentSemester(userId).catch(() => null),
    studentTimetable(userId).catch(() => null),
    lmsProfile(userId, email).catch(() => null),
  ]);
  const data: UserCache = { enrollment, timetable: timetable ?? [], profile };
  await db().insert(lmsCache).values({ userId, data, syncedAt: new Date() })
    .onConflictDoUpdate({ target: lmsCache.userId, set: { data, syncedAt: new Date() } });
  return data;
}

/** The cached snapshot, or null if the student has none yet. */
export async function readUserCache(userId: string): Promise<{ data: UserCache; syncedAt: Date } | null> {
  const [row] = await db().select().from(lmsCache).where(eq(lmsCache.userId, userId));
  return row ? { data: row.data as UserCache, syncedAt: row.syncedAt } : null;
}

export const cacheStale = (syncedAt: Date) => Date.now() - syncedAt.getTime() > CACHE_TTL_MS;

/**
 * The student's cached data, filling it on first use. Returns `stale` so the
 * page can trigger a background refresh with `after()` without blocking.
 */
export async function userData(userId: string, email: string): Promise<{ data: UserCache; stale: boolean }> {
  const cached = await readUserCache(userId);
  if (cached) return { data: cached.data, stale: cacheStale(cached.syncedAt) };
  return { data: await preloadUser(userId, email), stale: false };
}
