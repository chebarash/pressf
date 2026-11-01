import { eq } from "drizzle-orm";
import { publishedFile } from "@/lib/content";
import { db } from "@/lib/db";
import { materials } from "@/lib/db/schema";
import { signedUrl } from "@/lib/storage";
import { sendDocument } from "@/lib/telegram/api";
import { esc } from "@/lib/telegram/bot";
import { appButton } from "@/lib/telegram/links";
import { verifyInitData } from "@/lib/telegram/webapp";

// Telegram fetches up to 20 MB by URL and accepts up to 50 MB when a bot uploads.
const BY_URL = 20 * 1024 * 1024;
const BY_UPLOAD = 49 * 1024 * 1024;

const isBlocked = (error: unknown) => /forbidden|chat not found/i.test(String(error));

/** Sends a published file to the mini app user's chat with the bot. */
export async function POST(request: Request) {
  const { id, initData } = (await request.json()) as { id?: string; initData?: string };
  const chat = verifyInitData(initData ?? "");
  if (!chat) return Response.json({ error: "unauthorized" }, { status: 401 });
  const file = await publishedFile(id ?? "");
  if (!file) return Response.json({ error: "missing" }, { status: 404 });
  if (!file.sharedFileId && file.size > BY_UPLOAD) return Response.json({ error: "too_big" }, { status: 413 });

  const caption = `<b>${esc(file.fileName.replace(/\.[a-z0-9]+$/i, ""))}</b>`;
  const buttons = { inline_keyboard: file.courseCode ? [[appButton("Open course", `/courses/${file.courseCode}#files`)]] : [] };
  const send = (document: Parameters<typeof sendDocument>[1]) => sendDocument(chat, document, caption, buttons);
  const upload = async () => {
    const response = await fetch(await signedUrl(file.storageKey!, file.fileName));
    return send({ blob: await response.blob(), fileName: file.fileName });
  };

  try {
    let message;
    if (file.sharedFileId) message = await send(file.sharedFileId);
    else if (file.size > BY_URL) message = await upload();
    else message = await send(await signedUrl(file.storageKey!, file.fileName)).catch((error) => { if (isBlocked(error)) throw error; return upload(); });
    if (!file.sharedFileId && message.document) await db().update(materials).set({ sharedFileId: message.document.file_id }).where(eq(materials.id, file.id));
    return Response.json({ ok: true });
  } catch (error) {
    if (isBlocked(error)) return Response.json({ error: "no_access" }, { status: 403 });
    console.error("Could not send file", error);
    return Response.json({ error: "failed" }, { status: 502 });
  }
}
