import { and, asc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { localDay } from "@/core/time";
import { db } from "@/lib/db";
import { broadcasts, lmsCache, userState, users } from "@/lib/db/schema";
import { send, type BotMessage } from "@/lib/telegram/api";
import { esc } from "@/lib/telegram/html";
import { appButton } from "@/lib/telegram/links";
import { inQuietHours, type Audience } from "@/server/admin/rules";
import { audienceMatches, personOf, ratersOf } from "@/server/broadcasts";
import { pseudonym } from "@/server/identity";

/**
 * Sends due broadcasts through the bot, from the reminders cron. Never in
 * quiet hours (22:00–08:00), at most one broadcast per student per day, and
 * resumable: a big audience goes out over several runs, `stats.cursor` marks
 * where the last run stopped and `stats.lease` keeps two runs from sending the
 * same broadcast. `sentAt` is set when everyone has been tried.
 */

/** The local day of the last broadcast a student got, in their snapshot. */
export const DAY_KEY = "broadcastDay";
const LEASE_MS = 90_000;
const PACE_MS = 40;

type Stats = { targeted?: number; delivered?: number; opened?: number; skipped?: number; cursor?: string | null; lease?: string | null };

export type BroadcastRunResult = { broadcasts: number; sent: number; held: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function broadcastMessage(b: { text: string; button: { label: string; target: string } | null }): BotMessage {
  return { text: esc(b.text), keyboard: b.button ? { inline_keyboard: [[appButton(b.button.label, b.button.target)]] } : undefined };
}

/** Takes the broadcast for this run, unless another run holds a live lease. */
async function claim(id: string, now: Date) {
  const [row] = await db()
    .update(broadcasts)
    .set({ stats: sql`${broadcasts.stats} || ${JSON.stringify({ lease: new Date(now.getTime() + LEASE_MS).toISOString() })}::jsonb` })
    .where(and(eq(broadcasts.id, id), isNull(broadcasts.sentAt), sql`coalesce(${broadcasts.stats}->>'lease', '') < ${now.toISOString()}`))
    .returning();
  return row ?? null;
}

async function recipients(audience: Audience) {
  const rows = await db()
    .select({ id: users.id, chat: users.telegramId, data: lmsCache.data, day: sql<string | null>`${userState.snapshot}->>${DAY_KEY}` })
    .from(users)
    .leftJoin(lmsCache, eq(lmsCache.userId, users.id))
    .leftJoin(userState, eq(userState.userId, users.id))
    .where(isNotNull(users.telegramId))
    .orderBy(asc(users.id));
  const raters = audience.unrated ? await ratersOf(audience.unrated) : null;
  return rows.filter((r) => audienceMatches(audience, personOf(r.data, () => !!raters?.has(pseudonym(r.id, "rater")))));
}

const markDay = (userId: string, day: string) =>
  db()
    .insert(userState)
    .values({ userId, snapshot: { [DAY_KEY]: day } })
    .onConflictDoUpdate({ target: userState.userId, set: { snapshot: sql`${userState.snapshot} || ${JSON.stringify({ [DAY_KEY]: day })}::jsonb`, updatedAt: new Date() } });

export async function runBroadcasts(opts: { now?: Date; budgetMs?: number; pauseMs?: number } = {}): Promise<BroadcastRunResult> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const budget = opts.budgetMs ?? 25_000;
  const pause = opts.pauseMs ?? PACE_MS;
  const out: BroadcastRunResult = { broadcasts: 0, sent: 0, held: false };
  if (inQuietHours(now)) return { ...out, held: true };
  const day = localDay(now);

  const due = await db()
    .select({ id: broadcasts.id })
    .from(broadcasts)
    .where(and(isNull(broadcasts.sentAt), lte(broadcasts.sendAt, now)))
    .orderBy(asc(broadcasts.sendAt))
    .limit(5);
  for (const { id } of due) {
    if (Date.now() - started > budget) break;
    const b = await claim(id, now);
    if (!b) continue;
    out.broadcasts++;
    const stats = b.stats as Stats;
    const all = await recipients(b.audience);
    const todo = stats.cursor ? all.filter((r) => r.id > stats.cursor!) : all;
    const message = broadcastMessage(b);
    let delivered = stats.delivered ?? 0;
    let skipped = stats.skipped ?? 0;
    let cursor = stats.cursor ?? null;
    let finished = true;
    for (const r of todo) {
      if (Date.now() - started > budget) {
        finished = false;
        break;
      }
      cursor = r.id;
      // One broadcast per student per day.
      if (r.day === day) {
        skipped++;
        continue;
      }
      try {
        await send(r.chat!, message);
        delivered++;
        await markDay(r.id, day);
      } catch (error) {
        console.error("Broadcast send failed", error instanceof Error ? error.message : error);
      }
      if (pause) await sleep(pause);
    }
    out.sent += delivered - (stats.delivered ?? 0);
    const next: Stats = { ...stats, targeted: stats.targeted ?? all.length, delivered, skipped, cursor: finished ? null : cursor, lease: null };
    await db()
      .update(broadcasts)
      .set({ stats: next, ...(finished ? { sentAt: now } : {}) })
      .where(eq(broadcasts.id, b.id));
  }
  return out;
}

