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

/** Opening a notification marks it read here and in the LMS. */
export async function readNotification(userId: string, id: string) {
  await markRead(userId, [id]);
  return { lms: await toLms(userId, [id], lmsMarkRead) };
}

/** "Got it" on an announcement the teacher asked to confirm (Figma 2.10). */
export async function acknowledge(userId: string, id: string) {
  await markRead(userId, [id], true);
  const read = await toLms(userId, [id], lmsMarkRead);
  const acked = await toLms(userId, [id], lmsAcknowledge);
  return { lms: Math.min(read, acked) };
}

/** "Mark all read". Items that need an acknowledgement stay until "Got it". */
export async function markAllRead(userId: string) {
  const rows = await db().select({ id: feedItems.id }).from(feedItems).where(and(eq(feedItems.userId, userId), eq(feedItems.read, false), eq(feedItems.needsAck, false)));
  const ids = rows.map((r) => r.id);
  await markRead(userId, ids);
  return { count: ids.length, lms: await toLms(userId, ids, lmsMarkRead) };
}
