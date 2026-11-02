import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { lmsAccounts, userState, users } from "@/lib/db/schema";
import { runReminders } from "./reminders";
import { syncStudent, type SyncResult } from "./student";

/**
 * Cron batches. The LMS is weak, so students sync one at a time with a pause
 * between them, the least recently synced first, within a time budget; a
 * failing student is logged and skipped, never breaking the batch.
 */

export type BatchOptions = { now?: Date; limit?: number; budgetMs?: number; pauseMs?: number; minAgeMs?: number };

export type SyncBatchResult = { processed: number; ok: number; failed: number; skipped: number; sent: number; errors: Array<{ userId: string; error: string }> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lastTry = sql<string | null>`(${userState.snapshot}->'lms'->>'tried')`;

/** Students with an active saved login whose last sync attempt is older than `minAgeMs`, oldest first. */
export async function dueForSync(now: Date, limit: number, minAgeMs: number) {
  const cutoff = new Date(now.getTime() - minAgeMs).toISOString();
  const rows = await db()
    .select({ userId: lmsAccounts.userId })
    .from(lmsAccounts)
    .leftJoin(userState, eq(userState.userId, lmsAccounts.userId))
    .where(and(eq(lmsAccounts.status, "active"), sql`coalesce(${lastTry}, '') < ${cutoff}`))
    .orderBy(sql`${lastTry} asc nulls first`)
    .limit(limit);
  return rows.map((r) => r.userId);
}

export async function runSyncBatch(opts: BatchOptions = {}): Promise<SyncBatchResult> {
  const started = Date.now();
  const { limit = 25, budgetMs = 50_000, pauseMs = 500, minAgeMs = 20 * 60_000 } = opts;
  const ids = await dueForSync(opts.now ?? new Date(), limit, minAgeMs);
  const out: SyncBatchResult = { processed: 0, ok: 0, failed: 0, skipped: 0, sent: 0, errors: [] };
  for (const userId of ids) {
    if (Date.now() - started > budgetMs) break;
    out.processed++;
    let r: SyncResult;
    try {
      r = await syncStudent(userId, opts.now ?? new Date());
    } catch (error) {
      r = { userId, ok: false, error: error instanceof Error ? error.message : String(error), alerts: 0, sent: 0 };
    }
    if (r.skipped) out.skipped++;
    else if (r.ok) out.ok++;
    else {
      out.failed++;
      out.errors.push({ userId, error: r.error ?? "failed" });
    }
    out.sent += r.sent;
    if (pauseMs) await sleep(pauseMs);
  }
  return out;
}

export type RemindersBatchResult = { processed: number; sent: number; failed: number };

/** Time-based reminders for every student linked to Telegram (reads Postgres only). */
export async function runRemindersBatch(opts: { now?: Date; budgetMs?: number } = {}): Promise<RemindersBatchResult> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const rows = await db().select({ id: users.id }).from(users).where(isNotNull(users.telegramId));
  const out: RemindersBatchResult = { processed: 0, sent: 0, failed: 0 };
  for (const { id } of rows) {
    if (Date.now() - started > (opts.budgetMs ?? 50_000)) break;
    out.processed++;
    try {
      out.sent += (await runReminders(id, now)).sent;
    } catch (error) {
      out.failed++;
      console.error("Reminders failed", id, error instanceof Error ? error.message : error);
    }
  }
  return out;
}
