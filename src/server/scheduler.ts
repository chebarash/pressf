import { db } from "@/lib/db";
import { runRemindersBatch, runSyncBatch } from "@/server/sync/batch";
import { runBroadcasts } from "@/server/sync/broadcasts";

/**
 * Background jobs, run inside the web server (started from instrumentation):
 * reminders and broadcasts every minute, the student sync batch every five.
 * A Postgres advisory lock per job keeps two instances (or a slow run and the
 * next tick) from running the same job at once; the jobs themselves are
 * idempotent (sent keys, feed ingest, broadcast leases), so a repeat is harmless.
 * The cron routes stay for manual runs and share the same locks.
 */

export type Job = { name: string; everyMs: number; run: () => Promise<Record<string, unknown>> };

/** Stable 32-bit key per job name for pg_advisory_lock. */
function lockKey(name: string) {
  let h = 0x811c9dc5;
  for (const c of `pressf:job:${name}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h | 0;
}

/**
 * Runs `fn` while holding the job's session advisory lock, or returns
 * `{ locked: true }` straight away when another run holds it. The lock lives on
 * one pooled connection and is released even if `fn` throws.
 */
export async function withJobLock<T>(name: string, fn: () => Promise<T>): Promise<{ locked: true } | { locked: false; result: T }> {
  const client = await db().$client.connect();
  const key = lockKey(name);
  try {
    const { rows } = await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [key]);
    if (!rows[0]?.ok) return { locked: true };
    try {
      return { locked: false, result: await fn() };
    } finally {
      await client.query("select pg_advisory_unlock($1)", [key]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

export const JOBS: Job[] = [
  {
    name: "reminders",
    everyMs: 60_000,
    run: async () => {
      // Broadcasts first on a short budget; their failure never blocks reminders.
      const broadcasts = await runBroadcasts({ budgetMs: 15_000 }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
      return { ...(await runRemindersBatch({ budgetMs: 40_000 })), broadcasts };
    },
  },
  {
    name: "students",
    everyMs: 5 * 60_000,
    run: async () => {
      const r = await runSyncBatch({ limit: 25, budgetMs: 4 * 60_000 });
      return { ...r, errors: r.errors.length };
    },
  },
];

const fmt = (v: unknown): string => (v && typeof v === "object" ? `{${Object.entries(v).map(([k, x]) => `${k}=${fmt(x)}`).join(" ")}}` : String(v));

/** One run of one job under its lock, logged as a single line. Never throws. */
export async function runJob(job: Job) {
  const started = Date.now();
  try {
    const out = await withJobLock(job.name, job.run);
    if (out.locked) {
      console.log(`[scheduler] ${job.name} skipped: another run holds the lock`);
      return out;
    }
    const summary = Object.entries(out.result).map(([k, v]) => `${k}=${fmt(v)}`).join(" ");
    console.log(`[scheduler] ${job.name} ${Date.now() - started}ms ${summary}`);
    return out;
  } catch (error) {
    console.error(`[scheduler] ${job.name} failed after ${Date.now() - started}ms: ${error instanceof Error ? error.message : String(error)}`);
    return { locked: false as const, error };
  }
}

/** Whether this process should run the background jobs. */
export function schedulerEnabled(e: NodeJS.ProcessEnv = process.env) {
  if (e.NEXT_PHASE === "phase-production-build" || e.VITEST) return false;
  if (!e.DATABASE_URL) return false;
  const flag = (e.SCHEDULER ?? "").toLowerCase();
  if (flag === "off" || flag === "0" || flag === "false") return false;
  if (flag === "on" || flag === "1" || flag === "true") return true;
  return e.NODE_ENV === "production";
}

const state = globalThis as unknown as { pressfScheduler?: NodeJS.Timeout[] };

/** Starts the timers once per process. The first runs wait a little so start-up stays fast. */
export function startScheduler() {
  if (state.pressfScheduler || !schedulerEnabled()) return false;
  const running = new Set<string>();
  const tick = (job: Job) => {
    // A run still going in this process: skip rather than queue.
    if (running.has(job.name)) return;
    running.add(job.name);
    void runJob(job).finally(() => running.delete(job.name));
  };
  state.pressfScheduler = JOBS.map((job, i) => {
    const first = setTimeout(() => tick(job), 20_000 + i * 10_000);
    first.unref();
    const every = setInterval(() => tick(job), job.everyMs);
    every.unref();
    return every;
  });
  console.log(`[scheduler] started: ${JOBS.map((j) => `${j.name} every ${j.everyMs / 60_000} min`).join(", ")}`);
  return true;
}
