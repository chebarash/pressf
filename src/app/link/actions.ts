"use server";

import { eq } from "drizzle-orm";
import { miniAppUrl } from "@/core/links";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { issueLink, linkUsed } from "@/server/link";
import { shellUser } from "@/ui/shell/data";
import { qrPath } from "@/ui/shell/qr";

/**
 * D19: a one-time code that carries this desktop session into Telegram. The QR
 * is drawn here so the browser ships no QR library.
 */
export async function startTelegramLink() {
  const user = await getUser();
  if (!user) return null;
  const token = await issueLink(user.id);
  const url = miniAppUrl({ to: "link", token });
  return { token, url, qr: qrPath(url) };
}

/** The desktop polls this until the phone has opened the code. */
export async function telegramLinkUsed(token: string) {
  if (!(await getUser()) || typeof token !== "string" || token.length > 64) return false;
  return linkUsed(token);
}

/** The name the hand-off toast shows (1.11), once the Mini App is signed in. */
export async function signedInName() {
  return (await shellUser())?.name ?? null;
}

/** D20's Undo: stop sending alerts to that Telegram. */
export async function unlinkTelegram() {
  const user = await getUser();
  if (!user) return;
  await db().update(users).set({ telegramId: null }).where(eq(users.id, user.id));
}
