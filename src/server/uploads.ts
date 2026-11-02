import { and, asc, count, eq } from "drizzle-orm";
import { canMove, rejectMessage, liveMessage, routeUpload, trustOf, type RejectReason, type Trust, type UploadStatus } from "@/core/uploads";
import { db } from "@/lib/db";
import { uploads, userRoles } from "@/lib/db/schema";
import { audit } from "./audit";

export type NewUpload = Omit<typeof uploads.$inferInsert, "id" | "status" | "createdAt" | "reviewedAt" | "reviewedBy" | "opens">;

export async function trustFor(userId: string): Promise<Trust> {
  const rows = await db().select({ status: uploads.status, n: count() }).from(uploads).where(eq(uploads.uploaderId, userId)).groupBy(uploads.status);
  const [role] = await db().select({ manual: userRoles.manualTrust }).from(userRoles).where(eq(userRoles.userId, userId));
  const n = (s: UploadStatus) => rows.find((r) => r.status === s)?.n ?? 0;
  return trustOf({ live: n("live"), rejected: n("rejected"), manualTrust: role?.manual ?? null });
}

export class UploadRefused extends Error {}

/**
 * Takes a new upload from the bot. The same file for the same course is kept
 * once. Returns where it went so the bot can answer.
 */
export async function submitUpload(input: NewUpload, roll = Math.random()) {
  const trust = input.uploaderId ? await trustFor(input.uploaderId) : "normal";
  const route = routeUpload(trust, roll);
  if (route === "refuse") throw new UploadRefused("Sharing is paused for this account");
  const [row] = await db()
    .insert(uploads)
    .values({ ...input, status: route })
    .onConflictDoNothing({ target: [uploads.sha256, uploads.courseId] })
    .returning();
  if (!row) return { duplicate: true as const };
  return { duplicate: false as const, upload: row, status: route };
}

export const queue = (status: UploadStatus = "waiting", limit = 100) =>
  db().select().from(uploads).where(eq(uploads.status, status)).orderBy(asc(uploads.createdAt)).limit(limit);

async function move(id: string, to: UploadStatus, actorId: string, extra: Partial<typeof uploads.$inferInsert> = {}) {
  const [row] = await db().select().from(uploads).where(eq(uploads.id, id));
  if (!row) throw new Error("Upload not found");
  if (!canMove(row.status, to)) throw new Error(`Cannot move upload from ${row.status} to ${to}`);
  const [updated] = await db()
    .update(uploads)
    .set({ status: to, reviewedBy: actorId, reviewedAt: new Date(), ...extra })
    .where(and(eq(uploads.id, id), eq(uploads.status, row.status)))
    .returning();
  if (!updated) throw new Error("Upload changed while reviewing; reload");
  return updated;
}

/** Publish, optionally fixing details first. Returns the bot message for the uploader. */
export async function publish(id: string, actorId: string, edits: Partial<Pick<NewUpload, "title" | "type" | "courseId" | "courseCode" | "week" | "term" | "exam">> = {}, courseName = "") {
  const row = await move(id, "live", actorId, { ...edits, rejectReason: null, rejectNote: null });
  await audit(actorId, "upload.publish", id, { title: row.title, courseId: row.courseId, edits: Object.keys(edits) });
  return { upload: row, message: liveMessage(row.title, courseName || row.courseCode || "") };
}

export async function reject(id: string, actorId: string, reason: RejectReason, note = "", courseName = "") {
  const row = await move(id, "rejected", actorId, { rejectReason: reason, rejectNote: note || null });
  await audit(actorId, "upload.reject", id, { title: row.title, reason });
  return { upload: row, message: rejectMessage(row.title, courseName || row.courseCode || "", reason, note) };
}

export async function hide(id: string, actorId: string) {
  const row = await move(id, "hidden", actorId);
  await audit(actorId, "upload.hide", id, { title: row.title });
  return row;
}

/** Live student files for a course page. */
export const liveFor = (courseId: string) =>
  db().select().from(uploads).where(and(eq(uploads.courseId, courseId), eq(uploads.status, "live"))).orderBy(asc(uploads.week), asc(uploads.createdAt));

export const myUploads = (userId: string) => db().select().from(uploads).where(eq(uploads.uploaderId, userId)).orderBy(asc(uploads.createdAt));
