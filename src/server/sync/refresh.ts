import { after } from "next/server";
import type { SyncResult } from "./student";

/**
 * Background refresh of one student's LMS data, scheduled by a view when its
 * copy is stale. The page has already rendered from the old copy; the next
 * navigation shows the new one. One refresh per student at a time.
 */

const running = new Map<string, Promise<SyncResult | null>>();

/** The full student sync (LMS pull, snapshot, alerts). Imported lazily: the sync itself reads the views. */
export async function refreshStudent(userId: string): Promise<SyncResult> {
  const { syncStudent } = await import("./student");
  return syncStudent(userId);
}

/** Runs `refreshStudent` once per student, however many views ask. */
export function refreshOnce(userId: string): Promise<SyncResult | null> {
  const current = running.get(userId);
  if (current) return current;
  const job = refreshStudent(userId)
    .catch((error) => {
      console.error("Background LMS refresh failed", error instanceof Error ? error.message : error);
      return null;
    })
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
