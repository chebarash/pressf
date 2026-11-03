/**
 * Syllabi are read by the operator, not by the site: a syllabus file found on
 * a course's LMS page or imported from a channel is queued here, the operator
 * downloads it (GET /api/admin/syllabus/queue), reads it, and submits the
 * fields (POST /api/admin/syllabus), which stores them for the course page and
 * clears the queue item.
 */
import { createHash } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { getCatalog, normalizeCode } from "@/lib/catalog";
import { db } from "@/lib/db";
import { syllabi, syllabusQueue, type SyllabusData } from "@/lib/db/schema";
import { signedUrl } from "@/lib/storage";
import { findSyllabusCourse, SyllabusSubmitSchema, syllabusFlags } from "@/lib/syllabus";
import { invalidateUpload } from "@/server/views/cache";

export class SyllabusError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type QueueInput = { courseCode: string; sourceKey: string; fileId: string | null; storageKey: string; name: string; origin: "lms" | "import" };

/** Queues a syllabus file unless it was already parsed or queued. True when it is (now) waiting. */
export async function enqueueSyllabus(item: QueueInput) {
  const [parsed] = await db().select({ id: syllabi.id }).from(syllabi).where(eq(syllabi.sourceName, item.sourceKey));
  if (parsed) return false;
  await db().insert(syllabusQueue).values(item).onConflictDoNothing();
  return true;
}

/** The waiting files, oldest first. `withUrls` adds a signed download link (one hour) for each. */
export async function syllabusQueueItems({ withUrls = false } = {}) {
  const rows = await db().select().from(syllabusQueue).orderBy(asc(syllabusQueue.createdAt), asc(syllabusQueue.courseCode));
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      courseCode: row.courseCode,
      sourceKey: row.sourceKey,
      fileId: row.fileId,
      name: row.name,
      origin: row.origin,
      createdAt: row.createdAt.toISOString(),
      ...(withUrls ? { url: await signedUrl(row.storageKey, row.name) } : {}),
    }))
  );
}


export type SubmitResult =
  | { result: "stored" | "updated"; id: string; courseCode: string; sourceKey: string; flags: string[]; cleared: number }
  | { result: "not a syllabus"; courseCode: string; sourceKey: string | null; cleared: number };

/**
 * Stores a parsed syllabus for a course the way the parser did: a matched
 * syllabi row keyed by its source, with the data's flags, and a flag when the
 * document names another course. Submitting the same source again replaces it.
 */
export async function submitSyllabus(input: unknown): Promise<SubmitResult> {
  const parsed = SyllabusSubmitSchema.safeParse(input);
  if (!parsed.success) throw new SyllabusError(`Bad syllabus: ${parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "body"} ${i.message}`).join("; ")}`);
  const { courseCode, sourceKey, fileId, data: full } = parsed.data;
  const { courses } = await getCatalog();
  const course = courses.find((c) => normalizeCode(c.code) === normalizeCode(courseCode));
  if (!course) throw new SyllabusError(`Unknown course ${courseCode}`);
  const code = course.code;

  // The queue item this answers: by source (which may also be a stored syllabus
  // being corrected), by file id, or the course's only waiting file.
  let item: typeof syllabusQueue.$inferSelect | undefined;
  if (sourceKey) [item] = await db().select().from(syllabusQueue).where(eq(syllabusQueue.sourceKey, sourceKey));
  else if (fileId) {
    [item] = await db().select().from(syllabusQueue).where(eq(syllabusQueue.fileId, fileId));
    if (!item) throw new SyllabusError(`No queued syllabus with file id ${fileId}`, 404);
  } else {
    const waiting = (await db().select().from(syllabusQueue)).filter((i) => normalizeCode(i.courseCode) === normalizeCode(code));
    if (waiting.length > 1) throw new SyllabusError(`${waiting.length} files are queued for ${code}: give the sourceKey`);
    item = waiting[0];
  }
  if (item && normalizeCode(item.courseCode) !== normalizeCode(code)) throw new SyllabusError(`That file is queued for ${item.courseCode}, not ${code}`);
  const { is_syllabus: isSyllabus, ...data } = full;
  const source = sourceKey ?? item?.sourceKey ?? `operator:${code}:${createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16)}`;

  const clear = async () => (item ? (await db().delete(syllabusQueue).where(eq(syllabusQueue.id, item.id)).returning({ id: syllabusQueue.id })).length : 0);
  if (!isSyllabus) return { result: "not a syllabus", courseCode: code, sourceKey: item?.sourceKey ?? sourceKey ?? null, cleared: await clear() };

  const found = findSyllabusCourse(data, courses);
  const flags = syllabusFlags(data as SyllabusData, courses);
  const values = { courseCode: code, sourceName: source, data: data as SyllabusData, flags: found && found !== code ? [...flags, `names ${found}`] : flags, matched: true };
  const [before] = await db().select({ id: syllabi.id }).from(syllabi).where(eq(syllabi.sourceName, source));
  const [row] = await db()
    .insert(syllabi)
    .values(values)
    .onConflictDoUpdate({ target: syllabi.sourceName, set: { courseCode: values.courseCode, data: values.data, flags: values.flags, matched: true } })
    .returning({ id: syllabi.id });
  const cleared = await clear();
  invalidateUpload(code);
  return { result: before ? "updated" : "stored", id: row.id, courseCode: code, sourceKey: source, flags: values.flags, cleared };
}
