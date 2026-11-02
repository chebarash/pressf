import { and, eq, inArray } from "drizzle-orm";
import { deliverNow, type AlertSettings, type FeedKind } from "@/core/notifications";
import { localMinutes } from "@/core/time";
import { db } from "@/lib/db";
import { feedItems } from "@/lib/db/schema";
import { send, type BotMessage } from "@/lib/telegram/api";
import { ingest, markSent, saveSnapshot, snapshot } from "@/server/feed";
import type { Alert } from "./convert";
import { SENT_KEY } from "./types";

/**
 * Stores alerts in the feed (once) and sends the new ones to the bot,
 * respecting the student's alert settings and quiet hours. Alerts held by
 * quiet hours wait in the snapshot and go out on the first run after.
 */

export type Recipient = { userId: string; telegramId: string | null; alerts: AlertSettings };

const PENDING_KEY = "pending";
/** Don't send news older than this (e.g. old LMS announcements on a first sync). */
const MAX_AGE_MS = 2 * 86_400_000;
const PACE_MS = 40;

type Pending = { id: string; kind: FeedKind; message: BotMessage; at: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends one message; a failing chat (blocked bot) never throws into the sync. */
async function trySend(chatId: string, message: BotMessage) {
  try {
    await send(chatId, message);
    return true;
  } catch (error) {
    console.error("Bot alert failed", error instanceof Error ? error.message : error);
    return false;
  } finally {
    await sleep(PACE_MS);
  }
}

export async function deliver(to: Recipient, alerts: Alert[], now: Date): Promise<{ fresh: number; sent: number; held: number }> {
  const fresh = new Set((await ingest(to.userId, alerts.map((a) => a.item))).map((i) => i.id));
  const due = alerts.filter((a) => fresh.has(a.item.id) && !a.item.read && to.alerts[a.setting] !== false && now.getTime() - a.item.at.getTime() < MAX_AGE_MS);
  if (!to.telegramId || !due.length) return { fresh: fresh.size, sent: 0, held: 0 };

  const minutes = localMinutes(now);
  const sentIds: string[] = [];
  const held: Pending[] = [];
  for (const a of due) {
    if (!deliverNow(a.item.kind, minutes)) {
      held.push({ id: a.item.id, kind: a.item.kind, message: a.message, at: now.toISOString() });
      continue;
    }
    if (await trySend(to.telegramId, a.message)) sentIds.push(a.item.id);
  }
  await markSent(to.userId, sentIds);
  if (held.length) {
    const queued = (await snapshot<Pending[]>(to.userId, PENDING_KEY)) ?? [];
    await saveSnapshot(to.userId, PENDING_KEY, [...queued, ...held].slice(-50));
  }
  return { fresh: fresh.size, sent: sentIds.length, held: held.length };
}

/** Sends what quiet hours held back, if it is still unread and under a day old. */
export async function flushPending(to: Recipient, now: Date) {
  const queued = (await snapshot<Pending[]>(to.userId, PENDING_KEY)) ?? [];
  if (!queued.length || !to.telegramId) return 0;
  const minutes = localMinutes(now);
  const keep: Pending[] = [];
  const ready = queued.filter((p) => now.getTime() - Date.parse(p.at) < 86_400_000);
  const unread = ready.length
    ? new Set((await db().select({ id: feedItems.id }).from(feedItems).where(and(eq(feedItems.userId, to.userId), eq(feedItems.read, false), inArray(feedItems.id, ready.map((p) => p.id))))).map((r) => r.id))
    : new Set<string>();
  const sentIds: string[] = [];
  for (const p of ready) {
    if (!unread.has(p.id)) continue;
    if (!deliverNow(p.kind, minutes)) {
      keep.push(p);
      continue;
    }
    if (await trySend(to.telegramId, p.message)) sentIds.push(p.id);
  }
  await markSent(to.userId, sentIds);
  await saveSnapshot(to.userId, PENDING_KEY, keep);
  return sentIds.length;
}

/** Sent-reminder keys (digest:2026-11-02, class:…), pruned after a week. */
export async function sentKeys(userId: string): Promise<Record<string, string>> {
  return (await snapshot<Record<string, string>>(userId, SENT_KEY)) ?? {};
}

/**
 * A time-based reminder that is not a feed item (digest, class, QR, rating…):
 * sent once per key, if the setting is on. Callers pick their own time window
 * (07:30 digest, 18:00 exam eve…), so quiet hours do not apply here.
 */
export async function remind(to: Recipient, sent: Record<string, string>, key: string, setting: keyof AlertSettings, message: BotMessage, now: Date) {
  if (sent[key] || !to.telegramId || to.alerts[setting] === false) return false;
  const ok = await trySend(to.telegramId, message);
  if (ok) sent[key] = now.toISOString();
  return ok;
}

export async function saveSent(userId: string, sent: Record<string, string>, now: Date) {
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const kept = Object.fromEntries(Object.entries(sent).filter(([k, v]) => Date.parse(v) > weekAgo || k.startsWith("rating:") || k === "sync-stopped"));
  await saveSnapshot(userId, SENT_KEY, kept);
}
