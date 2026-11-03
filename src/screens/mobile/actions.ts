"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { parseQr, qrOutcome, type QrOutcome } from "@/core/qr";
import { getUser } from "@/lib/auth";
import { activateQr, LmsError } from "@/lib/lms/client";
import { sessionFor } from "@/lib/lms/store";
import { dismissAsk } from "@/server/ratings";
import { acknowledge, markAllRead, readNotification } from "@/server/sync/actions";
import { syncStudent } from "@/server/sync/student";
import { courseAttendance } from "@/server/views/progress";

/**
 * Mutations behind Today, Notifications and the QR check-in. Each checks the
 * signed-in student itself; the screens update optimistically and these
 * confirm. Feed write-back to the LMS is shared with the bot (server/sync).
 */

async function student() {
  const user = await getUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

const refresh = () => {
  revalidatePath("/");
  revalidatePath("/notifications");
};

const cleanId = (id: unknown) => (typeof id === "string" && id.length > 0 && id.length < 200 ? id : null);

/** Opening a notification: read here and in the LMS, after the response is sent. */
export async function markFeedRead(id: string) {
  const user = await student();
  const clean = cleanId(id);
  if (!clean) return;
  after(() => readNotification(user.id, clean).catch(() => {}));
  refresh();
}

/** "Mark all read" (items waiting for "Got it" stay). */
export async function markAllFeedRead() {
  const user = await student();
  await markAllRead(user.id);
  refresh();
}

/** "Got it": read, and the acknowledgement the LMS asked for. */
export async function acknowledgeFeed(id: string): Promise<{ ok: boolean }> {
  const user = await student();
  const clean = cleanId(id);
  if (!clean) return { ok: false };
  const { lms } = await acknowledge(user.id, clean);
  refresh();
  return { ok: lms > 0 || !clean.startsWith("lms:") };
}

export async function dismissRating(term: string) {
  const user = await student();
  await dismissAsk(user.id, String(term).slice(0, 40));
  revalidatePath("/");
}

/** "Retry" on the LMS-not-answering banner: one fresh sync, then the page re-renders. */
export async function retrySync(): Promise<{ ok: boolean }> {
  const user = await student();
  const result = await syncStudent(user.id).catch(() => null);
  revalidatePath("/");
  return { ok: !!result?.ok };
}

/** `absencesLeft` on a mark: "N absences left in this course" (Figma 10.3), from the stored snapshot. */
export type CheckIn =
  | Exclude<QrOutcome, { kind: "marked" }>
  | (Extract<QrOutcome, { kind: "marked" }> & { absencesLeft?: number | null })
  | { kind: "offline" }
  | { kind: "signin" }
  | { kind: "invalid" };

/** Absences left in the course a check-in counted for: the LMS reply names it, else the class on now. */
async function absencesLeft(userId: string, names: Array<string | null | undefined>): Promise<number | null> {
  for (const name of names) {
    if (!name) continue;
    const hit = await courseAttendance(userId, name).catch(() => null);
    if (hit) return hit.absences?.left ?? null;
  }
  return null;
}

/**
 * Sends a scanned classroom code to the LMS with the student's own session.
 * The scan was checked on the device; it is checked again here so only the
 * LMS attendance link can ever be called.
 */
export async function checkIn(text: string, course?: string | null): Promise<CheckIn> {
  const user = await getUser();
  if (!user) return { kind: "signin" };
  const parsed = parseQr(String(text).slice(0, 2000));
  if (!parsed.ok) return { kind: "invalid" };
  const session = await sessionFor(user.id).catch(() => null);
  if (!session) return { kind: "signin" };
  try {
    const { status, body } = await activateQr(session, parsed.token);
    const outcome = qrOutcome(status, body as Parameters<typeof qrOutcome>[1]);
    if (outcome.kind !== "marked") return outcome;
    const hint = typeof course === "string" ? course.slice(0, 200) : null;
    return { ...outcome, absencesLeft: await absencesLeft(user.id, [outcome.subject, hint]) };
  } catch (e) {
    if (e instanceof LmsError && e.status === 401) return { kind: "signin" };
    if (e instanceof LmsError && e.status === 0) return { kind: "offline" };
    return { kind: "error", message: "LMS error" };
  }
}
