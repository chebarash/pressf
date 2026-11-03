import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { feedItems } from "@/lib/db/schema";
import { acknowledgeNotification as lmsAcknowledge, markNotificationRead as lmsMarkRead } from "@/lib/lms/client";
import { sessionFor } from "@/lib/lms/store";
import { markRead } from "@/server/feed";

/**
 * Screen actions on the feed. Our copy changes at once (the UI is optimistic);
 * LMS announcements are marked read / acknowledged in the LMS too, so the
 * student never sees them twice. LMS failures never fail the action.
 */

const lmsId = (id: string) => (id.startsWith("lms:") ? id.slice(4) : null);

async function toLms(userId: string, ids: string[], call: typeof lmsMarkRead) {
  const remote = ids.map(lmsId).filter((x): x is string => !!x);
  if (!remote.length) return 0;
  const session = await sessionFor(userId).catch(() => null);
  if (!session) return 0;
  let done = 0;
  for (const id of remote) {
    try {
      await call(session, id);
      done++;
    } catch (error) {
      console.error("LMS write-back failed", error instanceof Error ? error.message : error);
    }
  }
  return done;
}

/**
 * Opening a notification reads it, here and in the LMS. When the LMS asked the
 * student to confirm it (`needsAck`), opening is the confirmation: the LMS gets
 * the acknowledgement too, and our row keeps `needsAck` so the screen can say
 * "Acknowledged" (read + needsAck = confirmed). No "Got it" needed.
 */
export async function readNotification(userId: string, id: string, opts: { later?: (task: () => Promise<unknown>) => void } = {}) {
  const [row] = await db().select({ read: feedItems.read, needsAck: feedItems.needsAck }).from(feedItems).where(and(eq(feedItems.userId, userId), eq(feedItems.id, id)));
  // Unknown or already read: nothing to write (reopening never calls the LMS again).
  if (!row || row.read) return { lms: 0 };
  await markRead(userId, [id]);
  const writeBack = async () => {
    const read = await toLms(userId, [id], lmsMarkRead);
    if (!row.needsAck) return read;
    return Math.min(read, await toLms(userId, [id], lmsAcknowledge));
  };
  // Screens pass `after`: our copy is read before the response, the LMS after it.
  if (opts.later) {
    opts.later(() => writeBack().catch(() => 0));
    return { lms: 0 };
  }
  return { lms: await writeBack() };
}

/** The old "Got it": the same as opening it. */
export const acknowledge = readNotification;

/** "Mark all read". Announcements the LMS wants confirmed stay unread until they are opened. */
export async function markAllRead(userId: string) {
  const rows = await db().select({ id: feedItems.id }).from(feedItems).where(and(eq(feedItems.userId, userId), eq(feedItems.read, false), eq(feedItems.needsAck, false)));
  const ids = rows.map((r) => r.id);
  await markRead(userId, ids);
  return { count: ids.length, lms: await toLms(userId, ids, lmsMarkRead) };
}
