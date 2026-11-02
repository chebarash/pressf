import { createHash } from "node:crypto";
import { extensionOf } from "@/core/files";
import { shownAs } from "@/core/uploads";
import { putObject } from "@/lib/storage";
import { submitUpload, UploadRefused } from "@/server/uploads";
import { downloadFile, send, type BotMessage } from "./api";
import { titleOf, type Draft } from "./conversation";
import { coverPdf } from "./cover";
import { alreadyShared, fileLive, sentForReview, sharingPaused, uploadFailed } from "./messages";

export type IntakeResult = "waiting" | "live" | "duplicate" | "paused" | "failed";

/**
 * The slow half of Send for review, run after the webhook has answered:
 * download from Telegram, hash, store in the bucket (with the Press F copy for
 * PDFs), then submitUpload with trust routing, and tell the student.
 */
export async function intake(chatId: number | string, userId: string, d: Draft): Promise<IntakeResult> {
  const { result, message } = await store(userId, d);
  await send(chatId, message).catch((error) => console.error("Could not answer an upload", error));
  return result;
}

async function store(userId: string, d: Draft): Promise<{ result: IntakeResult; message: BotMessage }> {
  const file = d.file!;
  const course = d.course!;
  const title = titleOf(d);
  let buffer: Buffer;
  try {
    buffer = await downloadFile(file.fileId);
  } catch (error) {
    console.error("Could not download an upload", error);
    return { result: "failed", message: uploadFailed() };
  }
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const ext = extensionOf(file.name) || "bin";
  const original = await putObject(`uploads/${sha256}.${ext}`, buffer, file.mime);
  let storageKey = original;
  if (ext === "pdf") {
    try {
      const branded = await coverPdf(buffer, { title, courseCode: course.code, courseName: course.name, type: d.type!, term: d.term, shownAs: shownAs(d.showName, d.name) });
      storageKey = await putObject(`uploads/${sha256}-pressf.pdf`, branded, "application/pdf");
    } catch (error) {
      // Encrypted or odd PDFs cannot be edited; the original is better than nothing.
      console.warn("Keeping the original, could not brand PDF", error);
    }
  }

  try {
    const out = await submitUpload({
      uploaderId: userId,
      courseId: course.id,
      courseCode: course.code,
      title,
      type: d.type!,
      exam: d.exam ?? null,
      term: d.term ?? null,
      showName: d.showName,
      checks: { originalKey: original },
      fileName: file.name,
      mimeType: file.mime,
      size: buffer.length,
      sha256,
      storageKey,
      telegramFileId: file.fileId,
    });
    if (out.duplicate) return { result: "duplicate", message: alreadyShared(course.name) };
    if (out.status === "live") return { result: "live", message: fileLive(title, course.name, course.code) };
    return { result: "waiting", message: sentForReview() };
  } catch (error) {
    if (error instanceof UploadRefused) return { result: "paused", message: sharingPaused() };
    throw error;
  }
}
