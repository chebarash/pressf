import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lmsCourses, uploads, users } from "@/lib/db/schema";
import { send } from "./api";
import { reviewOutcome } from "./messages";

/**
 * Tells the uploader how review went (Figma 11.5). The admin calls it after
 * `publish()` / `reject()` from src/server/uploads with the message they return:
 *
 *   const { upload, message } = await publish(id, actorId, edits, courseName);
 *   await notifyUploader(upload.id, message);
 *
 * Live files get an "Open in <course>" button; turned-down files a "Got it".
 * Returns false when there is nobody to tell (no uploader, Telegram not linked,
 * or the student blocked the bot). Never throws for delivery problems.
 */
export async function notifyUploader(uploadId: string, message: string): Promise<boolean> {
  const [row] = await db()
    .select({ status: uploads.status, courseId: uploads.courseId, courseCode: uploads.courseCode, chat: users.telegramId, courseName: lmsCourses.name })
    .from(uploads)
    .leftJoin(users, eq(users.id, uploads.uploaderId))
    .leftJoin(lmsCourses, eq(lmsCourses.id, uploads.courseId))
    .where(eq(uploads.id, uploadId));
  if (!row?.chat) return false;
  const live = row.status === "live" ? { courseName: row.courseName ?? row.courseCode ?? "the course", courseCode: row.courseCode } : null;
  try {
    await send(row.chat, reviewOutcome(message, live));
    return true;
  } catch (error) {
    console.error("Could not notify uploader", error);
    return false;
  }
}
