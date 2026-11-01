import { extname } from "node:path";
import { and, count, eq, gte } from "drizzle-orm";
import { getCatalog } from "@/lib/catalog";
import { db } from "@/lib/db";
import { materials, syllabi } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { extractSyllabus, matchesCourse, syllabusFlags } from "@/lib/syllabus";
import { answerCallback, downloadFile, editCaption, sendDocument, sendMessage, sendPhoto, TelegramMessage, TelegramUpdate } from "./api";
import { classify, KnownCourse } from "./classify";
import { storeMaterial } from "./store";

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // Bot API download limit
const MAX_PER_HOUR = 20;
const ALLOWED = [".pdf", ".docx", ".pptx"];

type Material = typeof materials.$inferSelect;

export const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const site = () => env().NEXTAUTH_URL.replace(/\/$/, "");
const review = () => env().TELEGRAM_FILES_REVIEW_CHAT_ID;

const TEXT = {
  start: "Send a syllabus, past exam, mock or notes as a file. Forwarding from a channel works too.\n\nAdd the course in the caption if the file name does not say it.",
  received: "Got it. We will check it and let you know.",
  duplicate: "We already have this file. Respect anyway.",
  wrongType: "Please send it as a PDF, DOCX or PPTX file.",
  tooBig: "Over 20 MB is more than a Telegram bot can read. Send a smaller file or message us.",
  slowDown: "That is a lot of files at once. Please try again in an hour.",
  published: (name: string) => `<b>Respects paid.</b> ${esc(name)} is now on Press F.`,
  rejected: (name: string) => `${esc(name)} was not added to Press F. It may be a duplicate or the wrong kind of file.`,
};

export const REVIEW_GUIDE = [
  "<b>Press F review desk</b>",
  "",
  "New files arrive here as cards.",
  "<b>Publish</b> puts the file on the course page with the Press F cover.",
  "<b>Reject</b> tells the sender it was not added.",
  "",
  "Wrong course or type? Reply to the card: <code>MATH111 midterm fall 2024 solutions</code>",
  "",
  "Before publishing, check for student names, IDs and signatures on scans.",
  "",
  "/pending files waiting for review",
  "/stats what is on the site",
].join("\n");

const keyboard = (id: string) => ({
  inline_keyboard: [[{ text: "Publish", callback_data: `approve:${id}` }, { text: "Reject", callback_data: `reject:${id}` }]],
});

export function reviewCaption(material: Pick<Material, "fileName" | "courseCode" | "courseName" | "type" | "term" | "hasSolutions" | "author" | "caption">) {
  const lines = [
    `<b>${esc(material.fileName)}</b>`,
    `Course: ${esc(material.courseCode ?? "?")} ${esc(material.courseName ?? "")}`.trim(),
    `Type: ${material.type ?? "?"}`,
    `Term: ${esc(material.term ?? "?")}`,
    `Solutions: ${material.hasSolutions ? "yes" : "no"}`,
  ];
  if (material.author) lines.push(`By: ${esc(material.author)}`);
  if (material.caption) lines.push("", esc(material.caption.slice(0, 300)));
  lines.push("", "Reply to fix it: MATH111 midterm fall 2024");
  return lines.join("\n").slice(0, 1024);
}

export async function knownCourses(): Promise<KnownCourse[]> {
  return (await getCatalog()).courses.map((course) => ({ code: course.code, name: course.subject }));
}

async function handleDocument(message: TelegramMessage) {
  const chatId = message.chat.id;
  const document = message.document!;
  const fileName = document.file_name ?? "file";
  if (!ALLOWED.includes(extname(fileName).toLowerCase())) return sendMessage(chatId, TEXT.wrongType);
  if ((document.file_size ?? 0) > MAX_FILE_SIZE) return sendMessage(chatId, TEXT.tooBig);

  const hourAgo = new Date(Date.now() - 3600_000);
  const [{ value }] = await db().select({ value: count() }).from(materials)
    .where(and(eq(materials.submitterChatId, String(chatId)), gte(materials.createdAt, hourAgo)));
  if (value >= MAX_PER_HOUR) return sendMessage(chatId, TEXT.slowDown);

  const [known] = await db().select({ id: materials.id }).from(materials).where(eq(materials.telegramFileUniqueId, document.file_unique_id));
  if (known) return sendMessage(chatId, TEXT.duplicate);

  const guess = classify(fileName, message.caption, await knownCourses());
  const [material] = await db().insert(materials).values({
    ...guess, fileName, mimeType: document.mime_type ?? "application/octet-stream",
    size: document.file_size ?? 0, caption: message.caption ?? null,
    telegramFileId: document.file_id, telegramFileUniqueId: document.file_unique_id,
    submitterChatId: String(chatId),
  }).returning();

  const card = await sendDocument(review(), document.file_id, reviewCaption(material), keyboard(material.id));
  await db().update(materials).set({ reviewMessageId: card.message_id }).where(eq(materials.id, material.id));
  return sendMessage(chatId, TEXT.received);
}

async function sendPending() {
  const rows = await db().select().from(materials).where(eq(materials.status, "pending")).orderBy(materials.createdAt).limit(20);
  if (!rows.length) return sendMessage(review(), "Nothing is waiting. Respect.");
  const lines = rows.map((row) => `• ${esc(row.fileName)}`);
  return sendMessage(review(), [`<b>${rows.length === 20 ? "20+" : rows.length} waiting</b>`, ...lines].join("\n"));
}

async function sendStats() {
  const rows = await db().select({ status: materials.status, value: count() }).from(materials).groupBy(materials.status);
  const of = (status: string) => rows.find((row) => row.status === status)?.value ?? 0;
  return sendMessage(review(), `<b>Files</b>\nPublished: ${of("approved")}\nWaiting: ${of("pending")}\nRejected: ${of("rejected")}`);
}

async function readSyllabus(material: Material, buffer: Buffer) {
  if (material.type !== "syllabus" || !material.fileName.toLowerCase().endsWith(".pdf")) return;
  try {
    const { is_syllabus: _ignored, ...data } = await extractSyllabus(buffer);
    const { courses } = await getCatalog();
    await db().insert(syllabi).values({
      courseCode: material.courseCode!, sourceName: material.fileName, materialId: material.id,
      data, flags: syllabusFlags(data, courses), matched: matchesCourse(data, courses),
    }).onConflictDoNothing();
  } catch (error) {
    // The file is still useful without the parsed fields.
    console.error("Could not read syllabus", error);
  }
}

async function handleCallback(query: NonNullable<TelegramUpdate["callback_query"]>) {
  if (String(query.message?.chat.id) !== review()) return answerCallback(query.id, "Not allowed.");
  const [action, id] = (query.data ?? "").split(":");
  const [material] = await db().select().from(materials).where(eq(materials.id, id));
  if (!material || material.status !== "pending") return answerCallback(query.id, "Already reviewed.");
  const messageId = query.message!.message_id;

  if (action === "reject") {
    await db().update(materials).set({ status: "rejected", submitterChatId: null }).where(eq(materials.id, id));
    await answerCallback(query.id);
    await editCaption(review(), messageId, `Rejected: ${esc(material.fileName)}`);
    if (material.submitterChatId) await sendMessage(material.submitterChatId, TEXT.rejected(material.fileName)).catch(() => {});
    return;
  }
  if (action !== "approve") return answerCallback(query.id);
  if (!material.courseCode || !material.type) return answerCallback(query.id, "Set the course and type first: reply to this message.");

  let stored;
  let buffer: Buffer;
  try {
    buffer = await downloadFile(material.telegramFileId!);
    stored = await storeMaterial(buffer, material);
  } catch (error) {
    console.error("Could not publish material", error);
    return answerCallback(query.id, "Upload failed. Try again.");
  }
  const [same] = await db().select({ id: materials.id }).from(materials).where(eq(materials.sha256, stored.sha256));
  if (same) {
    await db().update(materials).set({ status: "rejected", submitterChatId: null }).where(eq(materials.id, id));
    await answerCallback(query.id, "Same file is already published.");
    return editCaption(review(), messageId, `Duplicate: ${esc(material.fileName)}`);
  }
  await db().update(materials).set({ ...stored, status: "approved", publishedAt: new Date(), submitterChatId: null }).where(eq(materials.id, id));
  await answerCallback(query.id);
  await editCaption(review(), messageId, `Published: ${esc(material.fileName)}`);
  await readSyllabus(material, buffer);
  if (material.submitterChatId) {
    await sendPhoto(material.submitterChatId, `${site()}/bot/published.png`, TEXT.published(material.fileName), {
      inline_keyboard: [[{ text: "Open the course", url: `${site()}/courses/${material.courseCode}#files` }]],
    }).catch(() => {});
  }
}

/** A reply to a review card corrects it. Only the fields named in the reply change. */
async function handleReviewReply(message: TelegramMessage) {
  const [material] = await db().select().from(materials).where(and(eq(materials.reviewMessageId, message.reply_to_message!.message_id), eq(materials.status, "pending")));
  if (!material || !message.text) return;
  const fix = classify("", message.text, await knownCourses());
  const next = {
    courseCode: fix.courseCode ?? material.courseCode,
    courseName: fix.courseCode ? fix.courseName : material.courseName,
    type: fix.type ?? material.type,
    term: fix.term ?? material.term,
    author: fix.author ?? material.author,
    hasSolutions: /no solutions/i.test(message.text) ? false : /solution/i.test(message.text) || material.hasSolutions,
  };
  await db().update(materials).set(next).where(eq(materials.id, material.id));
  await editCaption(review(), material.reviewMessageId!, reviewCaption({ ...material, ...next }), keyboard(material.id));
}

export async function handleUpdate(update: TelegramUpdate) {
  if (update.callback_query) return handleCallback(update.callback_query);
  const message = update.message;
  if (!message) return;
  if (String(message.chat.id) === review()) {
    const command = message.text?.split(/[@\s]/)[0];
    if (command === "/pending") return sendPending();
    if (command === "/stats") return sendStats();
    if (command === "/help") return sendMessage(review(), REVIEW_GUIDE);
    if (message.reply_to_message) await handleReviewReply(message);
    return;
  }
  if (message.chat.type !== "private") return;
  if (message.document) return handleDocument(message);
  if (message.photo) return sendMessage(message.chat.id, TEXT.wrongType);
  return sendPhoto(message.chat.id, `${site()}/bot/welcome.png`, TEXT.start, {
    inline_keyboard: [[{ text: "Open Press F", url: site() }]],
  });
}
