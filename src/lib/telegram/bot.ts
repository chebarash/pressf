import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { and, count, eq, gte } from "drizzle-orm";
import { parseStartParam } from "@/core/links";
import { db } from "@/lib/db";
import { uploads } from "@/lib/db/schema";
import { trustFor } from "@/server/uploads";
import { answerCallback, editKeyboard, editMessage, send, type TelegramCallbackQuery, type TelegramMessage, type TelegramUpdate } from "./api";
import { answered, newDraft, parseData, reduce, render, type Draft, type DraftFile } from "./conversation";
import { intake } from "./intake";
import { askForFile, cancelled, expired, noCourseFound, notAFile, openPage, sharingPaused, slowDown, tooBig, welcome } from "./messages";
import { dropDraft, linkedUser, loadDraft, saveDraft, searchCourses, studentContext } from "./session";
import { startPath } from "./start";

export { esc } from "./html";

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // Bot API download limit
const MAX_PER_HOUR = 20;

/** Moderation moved to the Press F admin; kept for the setup script. */
export const REVIEW_GUIDE = [
  "<b>Press F review desk</b>",
  "",
  "Student files are now reviewed in the Press F admin, not in this group.",
].join("\n");

/** Runs slow work after Telegram has its 200, so the webhook answers fast. */
export type Later = (task: () => Promise<unknown>) => void;
const defaultLater: Later = (task) => after(() => task().catch((error) => console.error("Bot background task failed", error)));

const newId = () => randomBytes(4).toString("base64url");

/** The file in a message: a document, the largest photo, a video or an audio. */
export function fileOf(message: TelegramMessage): DraftFile | null {
  const largest = message.photo?.length ? message.photo[message.photo.length - 1] : null;
  if (largest) return { fileId: largest.file_id, uniqueId: largest.file_unique_id, name: "photo.jpg", mime: "image/jpeg", size: largest.file_size ?? 0 };
  const doc = message.document ?? message.video ?? message.audio;
  if (!doc) return null;
  const fallback = message.video ? "video.mp4" : message.audio ? "audio.mp3" : "file";
  return { fileId: doc.file_id, uniqueId: doc.file_unique_id, name: doc.file_name ?? fallback, mime: doc.mime_type ?? "application/octet-stream", size: doc.file_size ?? 0 };
}

async function uploadsLastHour(userId: string) {
  const [{ value }] = await db().select({ value: count() }).from(uploads)
    .where(and(eq(uploads.uploaderId, userId), gte(uploads.createdAt, new Date(Date.now() - 3600_000))));
  return value;
}

async function ask(chatId: number, userId: string, draft: Draft) {
  await saveDraft(chatId, userId, draft);
  await send(chatId, render(draft));
}

async function handleStart(chatId: number, fromId: number, param: string | undefined) {
  const upload = param?.match(/^upload_([\w-]+)$/)?.[1];
  if (upload) {
    const user = await linkedUser(fromId);
    if (!user) return send(chatId, welcome());
    const context = await studentContext(user.id, upload);
    return ask(chatId, user.id, newDraft({ id: newId(), ...context, linked: upload }));
  }
  if (param) {
    // Old links (course_MATH111) and the startapp codes (c_MATH111, rate, …).
    const old = startPath(param);
    if (old) return send(chatId, openPage(old));
    const target = parseStartParam(param);
    if (target.to !== "today" || param === "today") return send(chatId, openPage(target));
  }
  return send(chatId, welcome());
}

async function handleFile(chatId: number, fromId: number, file: DraftFile) {
  const user = await linkedUser(fromId);
  if (!user) return send(chatId, welcome());
  if (file.size > MAX_FILE_SIZE) return send(chatId, tooBig());
  if ((await trustFor(user.id)) === "paused") return send(chatId, sharingPaused());
  if ((await uploadsLastHour(user.id)) >= MAX_PER_HOUR) return send(chatId, slowDown());
  // A deep link left a draft waiting for this file; anything older is replaced.
  const waiting = await loadDraft(chatId);
  const draft = waiting?.step === "file" ? waiting : newDraft({ id: newId(), ...(await studentContext(user.id)) });
  return ask(chatId, user.id, reduce(draft, { kind: "file", file }));
}

async function handleText(chatId: number, fromId: number, text: string) {
  const user = await linkedUser(fromId);
  if (!user) return send(chatId, welcome());
  const draft = await loadDraft(chatId);
  if (draft?.step === "search") {
    const found = await searchCourses(text);
    if (!found.length) return send(chatId, noCourseFound(text.trim().slice(0, 60)));
    return ask(chatId, user.id, reduce(draft, { kind: "results", courses: found }));
  }
  if (draft && draft.step !== "file") return send(chatId, render(draft));
  return send(chatId, askForFile());
}

async function handleMessage(message: TelegramMessage) {
  const chatId = message.chat.id;
  const fromId = message.from?.id ?? chatId;
  const text = message.text?.trim();
  if (text?.startsWith("/start")) return handleStart(chatId, fromId, text.split(/\s+/)[1]);
  if (text === "/cancel") {
    await dropDraft(chatId);
    return send(chatId, cancelled());
  }
  const file = fileOf(message);
  if (file) return handleFile(chatId, fromId, file);
  if (text) return handleText(chatId, fromId, text);
  const user = await linkedUser(fromId);
  return send(chatId, user ? notAFile() : welcome());
}

async function handleCallback(query: TelegramCallbackQuery, later: Later) {
  const message = query.message;
  if (!message || message.chat.type !== "private") return answerCallback(query.id);
  const chatId = message.chat.id;
  if (query.data === "ok") {
    await answerCallback(query.id);
    return editKeyboard(chatId, message.message_id);
  }
  const parsed = parseData(query.data ?? "");
  if (!parsed) return answerCallback(query.id);
  const draft = await loadDraft(chatId);
  if (!draft || draft.id !== parsed.draft) {
    await answerCallback(query.id, expired().text);
    return editKeyboard(chatId, message.message_id).catch(() => {});
  }
  if (!parsed.event) return answerCallback(query.id);
  const next = reduce(draft, parsed.event);
  if (next === draft) return answerCallback(query.id);
  const user = await linkedUser(query.from?.id ?? chatId);
  if (!user) {
    await dropDraft(chatId);
    await answerCallback(query.id);
    return send(chatId, welcome());
  }
  await answerCallback(query.id);

  if (next.step === "sending") {
    await saveDraft(chatId, user.id, next);
    await editMessage(chatId, message.message_id, render(next).text);
    later(async () => {
      try {
        await intake(chatId, user.id, next);
      } finally {
        await dropDraft(chatId);
      }
    });
    return;
  }
  await saveDraft(chatId, user.id, next);
  // Picking an exam or a semester ticks it in place until both are set.
  if (next.step === draft.step) return editKeyboard(chatId, message.message_id, render(next).keyboard);
  if (next.step === "search") await editKeyboard(chatId, message.message_id);
  else await editMessage(chatId, message.message_id, answered(draft, next).text);
  return send(chatId, render(next));
}

export async function handleUpdate(update: TelegramUpdate, later: Later = defaultLater) {
  if (update.callback_query) return handleCallback(update.callback_query, later);
  const message = update.message;
  if (!message || message.chat.type !== "private") return;
  return handleMessage(message);
}
