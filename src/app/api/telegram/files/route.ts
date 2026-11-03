import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type { TelegramUpdate } from "@/lib/telegram/api";
import { handleUpdate } from "@/lib/telegram/bot";

export async function POST(request: Request) {
  const expected = Buffer.from(env().TELEGRAM_WEBHOOK_SECRET);
  const received = Buffer.from(request.headers.get("x-telegram-bot-api-secret-token") ?? "");
  if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return new Response(null, { status: 401 });
  }
  try {
    await handleUpdate((await request.json()) as TelegramUpdate);
  } catch (error) {
    console.error("Files bot update failed", error);
  }
  // Telegram resends on any non-200, which would repeat a failing update forever.
  return Response.json({ ok: true });
}
