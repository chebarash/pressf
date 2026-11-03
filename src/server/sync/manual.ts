import { loadStudent } from "@/server/views/student";
import { refreshOnce } from "./refresh";

/**
 * "Sync now" (Settings) and "Retry" (the LMS-down banner): one full sync for the
 * signed-in student, right away, then the caller re-renders. Limited to one run
 * per student a minute so a held-down button cannot hammer the LMS; a second
 * press while a sync runs joins it instead of starting another.
 */

export const MANUAL_SYNC_GAP_MS = 60_000;

export type ManualSync = {
  status: "synced" | "recent" | "lms-down" | "sign-in" | "paused" | "no-user";
  /** What to tell the student. */
  message: string;
  /** Last successful sync, ISO. */
  at: string | null;
};

const MESSAGES: Record<ManualSync["status"], string> = {
  synced: "Synced with the LMS just now",
  recent: "Already synced a moment ago",
  "lms-down": "The LMS isn't answering. Showing what we had",
  "sign-in": "Your LMS password changed. Sign in again to sync",
  paused: "Syncing is paused for maintenance",
  "no-user": "Sign in to sync",
};

export async function syncNowFor(userId: string, now = new Date()): Promise<ManualSync> {
  const before = await loadStudent(userId, { refresh: false });
  if (!before) return done("no-user", null);
  if (before.account === "invalid") return done("sign-in", before.sync.at);
  const tried = before.sync.tried ? Date.parse(before.sync.tried) : 0;
  if (now.getTime() - tried < MANUAL_SYNC_GAP_MS && !before.sync.error && (before.sync.v ?? 1) >= 2) return done("recent", before.sync.at);

  // Through refreshOnce: joins a background refresh already running for this student.
  const result = await refreshOnce(userId);
  const after = await loadStudent(userId, { refresh: false });
  const at = after?.sync.at ?? before.sync.at;
  if (!result) return done("lms-down", at);
  if (result.skipped === "paused") return done("paused", at);
  if (result.skipped === "no-user") return done("no-user", null);
  if (result.skipped === "no-login") return done("sign-in", at);
  return done(result.ok ? "synced" : "lms-down", at);
}

const done = (status: ManualSync["status"], at: string | null): ManualSync => ({ status, message: MESSAGES[status], at });
