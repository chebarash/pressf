import { startUpload } from "@/lib/telegram/bot";
import { limiter, telegramUser } from "@/lib/telegram/miniapp";

/**
 * "Share a file via the bot" from the Mini App: the bot writes the upload
 * prompt with the course picked straight into the student's chat, and the Mini
 * App then opens that chat and closes. (A t.me/<bot>?start=upload_… link from
 * the bot's own Mini App lands in the chat under the still-open Mini App, so it
 * is only the fallback when the bot can't write to the student.)
 */

const CODE = /^[A-Za-z0-9_-]{1,40}$/;
const uploadLimit = limiter(10, 60_000);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  if (typeof body?.code !== "string" || !CODE.test(body.code)) return Response.json({ error: "bad_request" }, { status: 400 });
  const user = await telegramUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!uploadLimit.take(user.id)) return Response.json({ error: "slow_down" }, { status: 429 });
  try {
    await startUpload(user.telegramId, user.telegramId, body.code);
    return Response.json({ ok: true });
  } catch (e) {
    // Most often the student never pressed Start (or blocked the bot): the client falls back to the start link.
    console.error("Could not start an upload", e instanceof Error ? e.message : e);
    return Response.json({ error: "no_access" }, { status: 403 });
  }
}
