import { and, eq } from "drizzle-orm";
import { downloadName, formatOf } from "@/core/files";
import { path } from "@/core/links";
import { db } from "@/lib/db";
import { lmsCourses, lmsFiles, telegramFiles, uploads, users } from "@/lib/db/schema";
import { fileOverride } from "@/server/decisions";
import { sendDocument, type InlineKeyboard } from "@/lib/telegram/api";
import { esc } from "@/lib/telegram/html";
import { appButton } from "@/lib/telegram/links";
import { dedupe } from "@/lib/telegram/miniapp";
import { verifyInitData } from "@/lib/telegram/webapp";
import { COVER_VERSION } from "@/server/covers";
import { deliverUrl, fileSource } from "@/server/covers/source";

// Telegram fetches up to 20 MB by URL and accepts up to 50 MB when a bot uploads.
const BY_URL = 20 * 1024 * 1024;
const BY_UPLOAD = 49 * 1024 * 1024;

const isBlocked = (error: unknown) => /forbidden|chat not found/i.test(String(error));

type Sendable = {
  /** Signed URL of the copy to send: branded once (src/server/covers), else the original. */
  url: () => Promise<string>;
  fileName: string;
  size: number;
  caption: string;
  buttons: InlineKeyboard;
  /** Telegram's id from an earlier send: resending it costs no upload. */
  fileId: string | null;
  remember: (fileId: string) => Promise<unknown>;
};

/**
 * Telegram file_ids are remembered per cover version: ids stored before files
 * were branded (or under an older cover) point at the original, so a new
 * version starts a fresh cache and the next send uploads the branded copy.
 */
// "n2": files are sent under their clean names; older cached copies carry the LMS name.
const BRANDED = `cover${COVER_VERSION}:n2:`;

const isUuid = (id: string) => /^[0-9a-f-]{36}$/.test(id);
const courseButtons = (code: string | null | undefined): InlineKeyboard => ({
  inline_keyboard: code ? [[appButton("Open course", path({ to: "course", code, tab: "files" }))]] : [],
});
const rememberAs = (key: string) => (fileId: string) =>
  db().insert(telegramFiles).values({ key, fileId }).onConflictDoUpdate({ target: telegramFiles.key, set: { fileId } });
const cached = async (key: string) => (await db().select({ fileId: telegramFiles.fileId }).from(telegramFiles).where(eq(telegramFiles.key, key)))[0]?.fileId ?? null;

/** A live student upload. */
async function upload(id: string): Promise<Sendable | null> {
  if (!isUuid(id)) return null;
  const [row] = await db().select({ u: uploads, courseName: lmsCourses.name }).from(uploads)
    .leftJoin(lmsCourses, eq(lmsCourses.id, uploads.courseId))
    .where(and(eq(uploads.id, id), eq(uploads.status, "live")));
  if (!row?.u.storageKey) return null;
  const courseName = row.courseName ?? row.u.courseCode ?? "";
  const ext = row.u.fileName.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? "";
  const key = `${BRANDED}upload:${row.u.id}`;
  return {
    url: async () => { const src = await fileSource(id, null); if (!src) throw new Error("missing"); return deliverUrl(src); },
    fileName: downloadName(row.u.title, courseName, formatOf(row.u.fileName), ext),
    size: row.u.size,
    caption: `<b>${esc(row.u.title)}</b>\n${esc(courseName)}`,
    buttons: courseButtons(row.u.courseCode),
    fileId: await cached(key),
    remember: rememberAs(key),
  };
}

/** An LMS lesson file, harvested into the bucket. */
async function lmsFile(id: string): Promise<Sendable | null> {
  if (!/^[\w-]{1,64}$/.test(id)) return null;
  const [row] = await db().select({ f: lmsFiles, courseName: lmsCourses.name }).from(lmsFiles)
    .leftJoin(lmsCourses, eq(lmsCourses.id, lmsFiles.courseId)).where(eq(lmsFiles.id, id));
  const edit = row ? await fileOverride(id) : null;
  if (!row || edit?.hidden) return null;
  const key = `${BRANDED}lms:${row.f.id}:${row.f.version ?? ""}`;
  const src = await fileSource(id, null);
  if (!src) return null;
  return {
    url: () => deliverUrl(src),
    fileName: src.downloadName,
    size: row.f.size ?? 0,
    caption: `<b>${esc(src.meta.title)}</b>${row.courseName ? `\n${esc(row.courseName)}` : ""}`,
    buttons: courseButtons(row.f.code),
    fileId: await cached(key),
    remember: rememberAs(key),
  };
}

type Result = { status: number; body: Record<string, unknown> };
const reply = (status: number, body: Record<string, unknown>): Result => ({ status, body });

/** A double-tapped Download (or a retried request) inside 10 s gets the first send's answer, not a second copy. */
const sends = dedupe<Result>(10_000, (r) => r.status !== 200);

/**
 * Sends a file to the Mini App user's chat with the bot: a live student upload
 * or an LMS file (signed-in students only). The first send
 * uploads it; Telegram's file_id is kept so every later send is instant.
 * The Mini App's Download calls this and falls back to a plain download on any
 * error: 403 no_access (the student never pressed Start, or blocked the bot),
 * 403 sign_in, 413 too_big (over the bot's 50 MB upload limit), 502 failed.
 */
export async function POST(request: Request) {
  const { id, initData } = ((await request.json().catch(() => null)) ?? {}) as { id?: unknown; initData?: unknown };
  const chat = verifyInitData(typeof initData === "string" ? initData : "");
  if (!chat) return Response.json({ error: "unauthorized" }, { status: 401 });
  const fileId = typeof id === "string" ? id : "";
  if (!fileId) return Response.json({ error: "missing" }, { status: 404 });
  const { status, body } = await sends.run(`${chat}:${fileId}`, () => deliver(chat, fileId));
  return Response.json(body, { status });
}

async function deliver(chat: string, fileId: string): Promise<Result> {
  let file = await upload(fileId);
  if (!file) {
    const lms = await lmsFile(fileId);
    if (lms) {
      const [user] = await db().select({ id: users.id }).from(users).where(eq(users.telegramId, chat));
      if (!user) return reply(403, { error: "sign_in" });
      file = lms;
    }
  }
  if (!file) return reply(404, { error: "missing" });
  if (!file.fileId && file.size > BY_UPLOAD) return reply(413, { error: "too_big" });

  const found = file;
  const send = (document: Parameters<typeof sendDocument>[1]) => sendDocument(chat, document, found.caption, found.buttons);
  const uploadIt = async () => {
    const response = await fetch(await found.url());
    return send({ blob: await response.blob(), fileName: found.fileName });
  };

  try {
    let message;
    if (found.fileId) message = await send(found.fileId);
    else if (found.size > BY_URL) message = await uploadIt();
    else message = await send(await found.url()).catch((error) => { if (isBlocked(error)) throw error; return uploadIt(); });
    if (!found.fileId && message.document) await found.remember(message.document.file_id);
    return reply(200, { ok: true });
  } catch (error) {
    if (isBlocked(error)) return reply(403, { error: "no_access" });
    console.error("Could not send file", error instanceof Error ? error.message : error);
    return reply(502, { error: "failed" });
  }
}
