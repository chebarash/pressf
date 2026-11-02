"use server";

import { validateRating, type RatingInput } from "@/core/ratings";
import { getUser } from "@/lib/auth";
import { saveRating } from "@/server/ratings";
import { invalidateRating } from "@/server/views";
import { loadRate } from "@/screens/mobile/load";

export type SendResult = { ok: true } | { ok: false; reason: "sign-in" | "not-yours" | "invalid" | "failed" };

/**
 * Saves the signed-in student's rating. Only a course from their own queue
 * (taken, or rated and still editable) can be rated, with that course's own
 * teachers; it is stored under the HMAC pseudonym.
 */
export async function sendRating(courseId: string, term: string, input: RatingInput): Promise<SendResult> {
  const user = await getUser();
  if (!user) return { ok: false, reason: "sign-in" };
  if (validateRating(input).length) return { ok: false, reason: "invalid" };
  const view = await loadRate(user.id, courseId);
  const item = view?.open?.item;
  if (!item || item.term !== term) return { ok: false, reason: "not-yours" };
  const allowed = new Set(item.teachers.map((t) => `${t.id}|${t.role}`));
  if (input.teachers.some((t) => !allowed.has(`${t.teacherId}|${t.role}`))) return { ok: false, reason: "invalid" };
  try {
    await saveRating(user.id, { id: courseId, code: item.code }, term, input);
  } catch {
    return { ok: false, reason: "failed" };
  }
  invalidateRating(item.code, input.teachers.map((t) => t.teacherId));
  return { ok: true };
}

/** Desktop rate screen (D5): the term is the course's own, from the queue. Throws when it can't be saved. */
export async function submitRating(courseId: string, input: RatingInput): Promise<void> {
  const user = await getUser();
  if (!user) throw new Error("Sign in to rate");
  const view = await loadRate(user.id, courseId);
  if (!view?.open) throw new Error("Not a course you can rate");
  const res = await sendRating(courseId, view.open.item.term, input);
  if (!res.ok) throw new Error(`Rating not saved: ${res.reason}`);
}
