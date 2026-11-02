import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { DEFAULT_ALERTS, type AlertSettings, type FeedItem } from "@/core/notifications";
import { db } from "@/lib/db";
import { feedItems, userState } from "@/lib/db/schema";

/**
 * Stores feed items and returns only the ones that are new, so the bot sends
 * each event once however often the sync runs.
 */
export async function ingest(userId: string, items: FeedItem[]): Promise<FeedItem[]> {
  if (!items.length) return [];
  const rows = await db()
    .insert(feedItems)
    .values(items.map((i) => ({ userId, id: i.id, kind: i.kind, title: i.title, body: i.body ?? null, courseId: i.courseId ?? null, href: i.href ?? null, at: i.at, read: i.read, needsAck: !!i.needsAck })))
    .onConflictDoNothing({ target: [feedItems.userId, feedItems.id] })
    .returning({ id: feedItems.id });
  const fresh = new Set(rows.map((r) => r.id));
  return items.filter((i) => fresh.has(i.id));
}

export async function feed(userId: string, limit = 100): Promise<FeedItem[]> {
  const rows = await db().select().from(feedItems).where(eq(feedItems.userId, userId)).orderBy(desc(feedItems.at)).limit(limit);
  return rows.map((r) => ({ id: r.id, kind: r.kind as FeedItem["kind"], title: r.title, body: r.body ?? undefined, courseId: r.courseId ?? undefined, href: r.href ?? undefined, at: r.at, read: r.read, needsAck: r.needsAck }));
}

export async function markRead(userId: string, ids: string[], acknowledge = false) {
  if (!ids.length) return;
  await db()
    .update(feedItems)
    .set({ read: true, ...(acknowledge ? { needsAck: false } : {}) })
    .where(and(eq(feedItems.userId, userId), inArray(feedItems.id, ids)));
}

export const markSent = (userId: string, ids: string[]) =>
  ids.length ? db().update(feedItems).set({ sentAt: new Date() }).where(and(eq(feedItems.userId, userId), inArray(feedItems.id, ids), isNull(feedItems.sentAt))) : Promise.resolve();

export async function alertSettings(userId: string): Promise<AlertSettings> {
  const [row] = await db().select({ alerts: userState.alerts }).from(userState).where(eq(userState.userId, userId));
  return { ...DEFAULT_ALERTS, ...(row?.alerts ?? {}) };
}

export async function setAlerts(userId: string, patch: Partial<AlertSettings>) {
  const next = { ...(await alertSettings(userId)), ...patch };
  await db().insert(userState).values({ userId, alerts: next }).onConflictDoUpdate({ target: userState.userId, set: { alerts: next, updatedAt: new Date() } });
  return next;
}

/** Last-seen snapshot (grades, absences) for change detection. */
export async function snapshot<T>(userId: string, key: string): Promise<T | null> {
  const [row] = await db().select({ s: userState.snapshot }).from(userState).where(eq(userState.userId, userId));
  return ((row?.s ?? {})[key] as T) ?? null;
}

export async function saveSnapshot(userId: string, key: string, value: unknown) {
  const [row] = await db().select({ s: userState.snapshot }).from(userState).where(eq(userState.userId, userId));
  const next = { ...(row?.s ?? {}), [key]: value };
  await db().insert(userState).values({ userId, snapshot: next }).onConflictDoUpdate({ target: userState.userId, set: { snapshot: next, updatedAt: new Date() } });
}
