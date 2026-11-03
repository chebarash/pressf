import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Cron calls carry `Authorization: Bearer <CRON_SECRET>`. */
export function cronAuthorized(request: Request) {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
