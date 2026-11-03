import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env } from "@/lib/env";

/**
 * Helpers for the Mini App's bot actions (/api/telegram/share, /api/telegram/upload):
 * who is asking (a signed-in student with Telegram linked), a per-user rate
 * limit, and signed share receipts.
 */

/** The signed-in student and their linked Telegram id, or null. */
export async function telegramUser(): Promise<{ id: string; telegramId: string } | null> {
  const user = await getUser();
  if (!user) return null;
  const [row] = await db().select({ telegramId: users.telegramId }).from(users).where(eq(users.id, user.id));
  return row?.telegramId ? { id: user.id, telegramId: row.telegramId } : null;
}

/**
 * Sliding-window limit per key, in memory (the app runs as one long-lived
 * process). Returns false once `max` calls happened inside `windowMs`.
 */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    take(key: string, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      // Drop idle keys now and then so the map can't grow without bound.
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      return true;
    },
    reset: () => hits.clear(),
  };
}

const key = () => createHmac("sha256", "PressFShareReceipt").update(env().TELEGRAM_BOT_TOKEN).digest();

/**
 * A receipt for one prepared message: "<preparedId>.<startParam>.<expires>.<sig>".
 * The Mini App sends it back when Telegram says the message was sent, so a share
 * is counted only for a message this server prepared, and only once.
 */
export function signReceipt(preparedId: string, startParam: string, expires: number) {
  const body = `${preparedId}.${startParam}.${expires}`;
  return `${body}.${createHmac("sha256", key()).update(body).digest("base64url")}`;
}

/** The prepared id and start param of a valid, unexpired receipt; null otherwise. */
export function readReceipt(receipt: string, now = Date.now()): { preparedId: string; startParam: string } | null {
  // Start params and the signature hold no dots; the prepared id is whatever is left.
  const parts = receipt.split(".");
  if (parts.length < 4) return null;
  const [startParam, expires, sig] = parts.slice(-3);
  const preparedId = parts.slice(0, -3).join(".");
  const expected = createHmac("sha256", key()).update(`${preparedId}.${startParam}.${expires}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Number(expires) * 1000 < now) return null;
  return { preparedId, startParam };
}
