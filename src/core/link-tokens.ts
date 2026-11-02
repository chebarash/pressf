import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * One-time tokens that carry a desktop session into Telegram (and back).
 * The token is random; the server stores only its HMAC, with a 10-minute life.
 */
export const LINK_TTL_MS = 10 * 60_000;
export const newLinkToken = () => randomBytes(18).toString("base64url");
export const hashToken = (token: string, secret: string) => createHmac("sha256", secret).update(token).digest("hex");

export function tokenMatches(token: string, storedHash: string, secret: string) {
  const a = Buffer.from(hashToken(token, secret), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const linkExpired = (createdAt: Date, now: Date) => now.getTime() - createdAt.getTime() > LINK_TTL_MS;
