"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_ALERTS, type AlertSettings } from "@/core/notifications";
import { getUser } from "@/lib/auth";
import { deleteAccount } from "@/server/account";
import { setAlerts } from "@/server/feed";
import { refreshOnce } from "@/server/sync/refresh";
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

/** "Sync now": refresh the student's LMS copy, then show it. */
export async function syncNow(): Promise<void> {
  const user = await getUser();
  if (!user) return;
  await refreshOnce(user.id);
  revalidatePath("/", "layout");
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
