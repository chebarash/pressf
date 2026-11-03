import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lmsAccounts, lmsCache, userState, users } from "@/lib/db/schema";
import { CACHE_TTL_MS, type UserCache } from "@/lib/lms/cache";
import { lmsDay } from "@/lib/lms/semesters";
import { SNAPSHOT_KEY, emptySnapshot, normalizeSnapshot, outdated, type SyncSnapshot } from "@/server/sync/types";
import { scheduleRefresh } from "@/server/sync/refresh";
import { DEFAULT_ALERTS, type AlertSettings } from "@/core/notifications";

/**
 * Everything we hold about one student, in a single query: the sign-in
 * snapshot (enrollment, weekly timetable, profile), the sync snapshot
 * (gradebook, assignments, dated classes) and the saved-login state.
 * Never calls the LMS; schedules a background refresh when stale.
 */

export type AccountState = "active" | "invalid" | "none";

/** The banner state every per-student screen can show (Figma 2.7, 2.8, 5.5). */
export type SyncState = {
  /** Newest of the two snapshots, ISO; null before the first sync. */
  syncedAt: string | null;
  stale: boolean;
  /** The LMS did not answer on the last try; data is from `syncedAt`. */
  lmsDown: boolean;
  /** The saved LMS password stopped working: ask to sign in again. */
  signInAgain: boolean;
};

export type Student = {
  userId: string;
  email: string;
  telegramId: string | null;
  cache: UserCache | null;
  sync: SyncSnapshot;
  alerts: AlertSettings;
  account: AccountState;
  state: SyncState;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const newest = (...xs: Array<string | null>) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;

export async function loadStudent(userId: string, opts: { refresh?: boolean } = {}): Promise<Student | null> {
  const [row] = await db()
    .select({
      email: users.email,
      telegramId: users.telegramId,
      cache: lmsCache.data,
      cacheAt: lmsCache.syncedAt,
      snapshot: userState.snapshot,
      alerts: userState.alerts,
      status: lmsAccounts.status,
    })
    .from(users)
    .leftJoin(lmsCache, eq(lmsCache.userId, users.id))
    .leftJoin(userState, eq(userState.userId, users.id))
    .leftJoin(lmsAccounts, eq(lmsAccounts.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) return null;

  const stored = row.snapshot?.[SNAPSHOT_KEY] as Partial<SyncSnapshot> | undefined;
  const sync = stored ? normalizeSnapshot(stored) : emptySnapshot();
  // Snapshots written before dates were normalised hold LMS raw values (unix numbers…).
  sync.semesters = (sync.semesters ?? []).map((m) => ({ ...m, starts: lmsDay(m.starts), ends: lmsDay(m.ends) }));
  const account: AccountState = row.status ?? "none";
  const cacheAt = iso(row.cacheAt);
  const syncedAt = newest(cacheAt, sync.at);
  // A weekly pattern cached before class types were kept merges lectures with labs: rebuild it now.
  const untyped = !!(row.cache as UserCache | null)?.timetable?.some((l) => !l.kind);
  const stale = !syncedAt || Date.now() - Date.parse(syncedAt) > CACHE_TTL_MS || outdated(sync) || untyped;
  const state: SyncState = { syncedAt, stale, lmsDown: !!sync.error, signInAgain: account === "invalid" };

  if (opts.refresh !== false && stale && account === "active") scheduleRefresh(userId);

  return {
    userId,
    email: row.email,
    telegramId: row.telegramId,
    cache: (row.cache as UserCache | null) ?? null,
    sync,
    alerts: { ...DEFAULT_ALERTS, ...(row.alerts ?? {}) },
    account,
    state,
  };
}
