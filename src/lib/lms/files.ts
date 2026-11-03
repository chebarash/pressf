import { and, eq, or } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { lmsDate } from "@/lib/lms/semesters";
import { db } from "@/lib/db";
import { lmsCourses, lmsFiles, syllabi } from "@/lib/db/schema";
import { downloadFile, lesson, type LmsSession } from "@/lib/lms/client";
import type { LmsLesson, LmsMaterial, LmsSubject } from "@/lib/lms/types";
import { putObject } from "@/lib/storage";
import { enqueueSyllabus } from "@/server/syllabus-queue";

/**
 * Pulls a course's lesson materials from the LMS into our bucket, once per file,
 * so every student of the course gets them from us instead of hammering the LMS.
 * Runs on demand when a signed-in student opens a course whose files are stale.
 * Files are official: no moderation, no Press F cover, and ones that disappear
 * from the LMS are kept. A syllabus PDF found here is queued for the operator to read.
 */

/** Re-pull a course's files at most this often. */
export const FILES_TTL_MS = 6 * 60 * 60 * 1000;
const LESSON_CONCURRENCY = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const mimeOf = (ext: string | undefined, fallback: string) =>
  ext === "pdf" ? "application/pdf" : ext && /^[a-z0-9]+$/i.test(ext) ? `application/${ext}` : fallback;

/** Page count of a PDF, or null when it is not one or cannot be read. */
export async function pdfPages(bytes: Uint8Array, extension?: string | null, mimeType?: string | null): Promise<number | null> {
  const isPdf = extension?.toLowerCase() === "pdf" || mimeType === "application/pdf" || Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
  if (!isPdf) return null;
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
    return doc.getPageCount();
  } catch {
    return null;
  }
}

async function pullMaterial(session: LmsSession, courseId: string, code: string, lessonId: string, m: LmsMaterial) {
  if (!m.fileFullUrl || !m.id) return null;
  const dates = { lmsCreatedAt: lmsDate(m.created_at), lmsUpdatedAt: lmsDate(m.updated_at) };
  const [existing] = await db().select({ version: lmsFiles.version, created: lmsFiles.lmsCreatedAt }).from(lmsFiles).where(eq(lmsFiles.id, m.id));
  if (existing && existing.version === (m.file_version ?? null)) {
    // Already have this version; fill in the LMS dates of files pulled before we kept them.
    if (!existing.created && (dates.lmsCreatedAt || dates.lmsUpdatedAt)) await db().update(lmsFiles).set(dates).where(eq(lmsFiles.id, m.id));
    return m;
  }
  const { bytes, contentType } = await downloadFile(session, m.fileFullUrl);
  const key = `lms/${courseId}/${m.id}${m.file_extension ? `.${m.file_extension}` : ""}`;
  const mimeType = mimeOf(m.file_extension, contentType);
  await putObject(key, bytes, mimeType);
  const row = {
    id: m.id, courseId, code, lessonId, name: m.name, extension: m.file_extension ?? null,
    version: m.file_version ?? null, storageKey: key, size: bytes.length, mimeType, fetchedAt: new Date(),
    pages: await pdfPages(bytes, m.file_extension, mimeType), ...dates,
  };
  await db().insert(lmsFiles).values(row).onConflictDoUpdate({ target: lmsFiles.id, set: row });
  return m;
}

/**
 * Queue the first syllabus PDF we pulled for the operator to read, unless it
 * was parsed already. The file sits on this course's LMS page, so it is queued
 * for this course; a document naming another course is flagged when submitted.
 */
async function queueSyllabus(code: string, materials: Array<{ lessonId: string; m: LmsMaterial }>) {
  const hit = materials.find(({ m }) => /syllab/i.test(m.name) && m.file_extension?.toLowerCase() === "pdf" && m.fileFullUrl);
  if (!hit?.m.id) return;
  // Keyed by the LMS file, not its name: many courses call theirs "Syllabus.pdf".
  const source = `lms:${hit.m.id}`;
  try {
    const [already] = await db().select({ id: syllabi.id }).from(syllabi).where(or(eq(syllabi.sourceName, source), and(eq(syllabi.sourceName, hit.m.name), eq(syllabi.courseCode, code))));
    if (already) return;
    const [file] = await db().select({ storageKey: lmsFiles.storageKey }).from(lmsFiles).where(eq(lmsFiles.id, hit.m.id));
    if (!file) return;
    await enqueueSyllabus({ courseCode: code, sourceKey: source, fileId: hit.m.id, storageKey: file.storageKey, name: hit.m.name, origin: "lms" });
  } catch (error) {
    console.error("Could not queue LMS syllabus", error);
  }
}

/** Harvest one course's files. `courseId` is the LMS subject id. */
export async function harvestCourseFiles(session: LmsSession, courseId: string) {
  const [course] = await db().select({ code: lmsCourses.code, raw: lmsCourses.raw }).from(lmsCourses).where(eq(lmsCourses.id, courseId));
  if (!course) return { files: 0 };
  const lessons = ((course.raw as LmsSubject).lessons ?? []) as LmsLesson[];
  const lessonIds = [...new Set(lessons.map((l) => l.id).filter(Boolean))];

  const pulled: Array<{ lessonId: string; m: LmsMaterial }> = [];
  let count = 0;
  for (let i = 0; i < lessonIds.length; i += LESSON_CONCURRENCY) {
    const batch = lessonIds.slice(i, i + LESSON_CONCURRENCY);
    const details = await Promise.all(batch.map((id) => lesson(session, id).catch(() => null)));
    for (let k = 0; k < batch.length; k++) {
      for (const m of details[k]?.lessonMaterials ?? []) {
        pulled.push({ lessonId: batch[k], m });
        const ok = await pullMaterial(session, courseId, course.code, batch[k], m).catch(() => null);
        if (ok) count++;
      }
    }
    await sleep(120);
  }

  await queueSyllabus(course.code, pulled);
  await db().update(lmsCourses).set({ filesSyncedAt: new Date() }).where(eq(lmsCourses.id, courseId));
  return { files: count };
}

/** True when the course's files have never been pulled or are older than the TTL. */
export async function filesAreStale(courseId: string) {
  const [row] = await db().select({ at: lmsCourses.filesSyncedAt }).from(lmsCourses).where(eq(lmsCourses.id, courseId));
  if (!row) return false;
  return !row.at || Date.now() - row.at.getTime() > FILES_TTL_MS;
}

/** The harvested LMS files for a course code. */
export const lmsFilesFor = (code: string) =>
  db().select().from(lmsFiles).where(eq(lmsFiles.code, code)).orderBy(lmsFiles.name);

/** An LMS subject id for a course code (several ids can share a code; any works). */
export async function courseIdForCode(code: string) {
  const [row] = await db().select({ id: lmsCourses.id }).from(lmsCourses).where(eq(lmsCourses.code, code)).limit(1);
  return row?.id ?? null;
}
