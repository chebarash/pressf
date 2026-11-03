"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_ALERTS, type AlertSettings } from "@/core/notifications";
import { getUser } from "@/lib/auth";
import { deleteAccount } from "@/server/account";
import { resetCalendarFeed, saveCalendarLayers } from "@/server/calendar-feed";
import { setAlerts } from "@/server/feed";
import { syncNowFor, type ManualSync } from "@/server/sync/manual";
import { invalidateRating } from "@/server/views";

const KEYS = new Set(Object.keys(DEFAULT_ALERTS));

/** One alert switch (8.5). Optimistic on the client; this confirms it. */
export async function setAlert(key: string, on: boolean): Promise<AlertSettings | null> {
  const user = await getUser();
  if (!user || !KEYS.has(key) || typeof on !== "boolean") return null;
  const next = await setAlerts(user.id, { [key]: on } as Partial<AlertSettings>);
  revalidatePath("/me", "layout");
  return next;
}

/** Desktop Settings' alert switch (same rule, no return value). */
export async function saveAlert(key: string, on: boolean): Promise<void> {
  await setAlert(key, on);
}

/** "Sync now": one sync for the student (rate limited), then every page re-reads. Returns what to tell them. */
export async function syncNow(): Promise<ManualSync> {
  const user = await getUser();
  if (!user) return { status: "no-user", message: "Sign in to sync", at: null };
  const result = await syncNowFor(user.id);
  revalidatePath("/", "layout");
  return result;
}

/**
 * Delete my data (8.7): the account, saved LMS login, cache, feed, settings
 * and the student's ratings. The client signs out right after.
 */
export async function deleteMyData(): Promise<{ ok: boolean }> {
  const user = await getUser();
  if (!user) return { ok: false };
  const { courses } = await deleteAccount(user.id);
  // Rating summaries are cached per course; drop the ones these ratings fed.
  for (const code of courses) invalidateRating(code);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The Calendar page's layer choice, kept for the student's calendar feed. */
export async function rememberCalendarLayers(layers: string[]): Promise<void> {
  const user = await getUser();
  if (!user || !Array.isArray(layers)) return;
  await saveCalendarLayers(user.id, layers.filter((l) => typeof l === "string"));
}

/** Settings' "Reset link": the old calendar feed URL stops working; add the calendar again with the new one. */
export async function resetCalendarLink(): Promise<{ ok: boolean }> {
  const user = await getUser();
  if (!user) return { ok: false };
  await resetCalendarFeed(user.id);
  revalidatePath("/calendar");
  return { ok: true };
}
