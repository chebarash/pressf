import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Checks the signed launch data Telegram gives a mini app and returns the user's
 * Telegram id. See https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(initData: string, maxAgeSeconds = 86_400): string | null {
  const token = env().TELEGRAM_FILES_BOT_TOKEN;
  if (!token || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const check = [...params.entries()].map(([key, value]) => `${key}=${value}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Date.now() / 1000 - Number(params.get("auth_date")) > maxAgeSeconds) return null;
  try {
    const id = (JSON.parse(params.get("user") ?? "{}") as { id?: number }).id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}
