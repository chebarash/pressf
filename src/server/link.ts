import { and, eq, isNull, lt } from "drizzle-orm";
import { hashToken, linkExpired, LINK_TTL_MS, newLinkToken } from "@/core/link-tokens";
import { db } from "@/lib/db";
import { linkTokens } from "@/lib/db/schema";
import { linkSecret } from "./identity";

/**
 * Desktop → Telegram hand-off: the desktop asks for a one-time code, shows it as
 * a QR / t.me link; the Mini App redeems it and is signed in as the same person.
 */
export async function issueLink(userId: string) {
  const token = newLinkToken();
  await db().insert(linkTokens).values({ hash: hashToken(token, linkSecret()), userId });
  return token;
}

/** Returns the user id once; a used, unknown or expired code returns null. */
export async function redeemLink(token: string, now = new Date()): Promise<string | null> {
  const hash = hashToken(token, linkSecret());
  const [row] = await db()
    .update(linkTokens)
    .set({ usedAt: now })
    .where(and(eq(linkTokens.hash, hash), isNull(linkTokens.usedAt)))
    .returning();
  if (!row || linkExpired(row.createdAt, now)) return null;
  return row.userId;
}

/** Whether the code was used yet (the desktop polls this to close its dialog). */
export async function linkUsed(token: string) {
  const [row] = await db().select({ usedAt: linkTokens.usedAt }).from(linkTokens).where(eq(linkTokens.hash, hashToken(token, linkSecret())));
  return !!row?.usedAt;
}

export const purgeLinks = (now = new Date()) => db().delete(linkTokens).where(lt(linkTokens.createdAt, new Date(now.getTime() - 24 * 3600_000 - LINK_TTL_MS)));
