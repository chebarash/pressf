import { publishedFile } from "@/lib/content";
import { signedUrl } from "@/lib/storage";
import { sendDocument } from "@/lib/telegram/api";
import { esc } from "@/lib/telegram/bot";
import { verifyInitData } from "@/lib/telegram/webapp";

// Telegram fetches up to 20 MB by URL and accepts up to 50 MB when a bot uploads.
const BY_URL = 20 * 1024 * 1024;
const BY_UPLOAD = 49 * 1024 * 1024;

/** Sends a published file to the mini app user's chat with the bot. */
export async function POST(request: Request) {
  const { id, initData } = (await request.json()) as { id?: string; initData?: string };
  const chat = verifyInitData(initData ?? "");
  if (!chat) return Response.json({ error: "unauthorized" }, { status: 401 });
  const file = await publishedFile(id ?? "");
  if (!file) return Response.json({ error: "missing" }, { status: 404 });
  if (file.size > BY_UPLOAD) return Response.json({ error: "too_big" }, { status: 413 });

  const name = file.fileName.replace(/\.[a-z0-9]+$/i, "");
  const url = await signedUrl(file.storageKey!, file.fileName);
  const open = { inline_keyboard: [[{ text: "Open course", url: `${new URL(request.url).origin}/courses/${file.courseCode}#files` }]] };
  try {
    const document = file.size <= BY_URL ? url : { blob: await (await fetch(url)).blob(), fileName: file.fileName };
    await sendDocument(chat, document, `<b>${esc(name)}</b>`, file.courseCode ? open : { inline_keyboard: [] });
    return Response.json({ ok: true });
  } catch (error) {
    const blocked = /forbidden|chat not found/i.test(String(error));
    if (!blocked) console.error("Could not send file", error);
    return Response.json({ error: blocked ? "no_access" : "failed" }, { status: blocked ? 403 : 502 });
  }
}
