/**
 * Importing course files from a Telegram channel export (scripts/import-export.ts).
 *
 * `planImport` reads one file and says what it looks like — course (top 3 with
 * reasons), type, term, title, duplicates, flags — and writes nothing. A lead
 * reviews the plan; `commitImport` then publishes each approved file at once
 * (no moderation queue), shown as coming from the channel, never a person.
 * Re-running a commit for the same post updates its row instead of adding one.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, ne, or } from "drizzle-orm";
import {
  confidenceOf, courseCandidates, examGuess, exportDate, LARGE_BYTES, notCourseFile, sourceKeyOf, termOf, titleGuess, typeGuess, weekGuess,
  type Candidate, type Confidence, type ImportCourse,
} from "@/core/import";
import { extensionOf, type FileType } from "@/core/files";
import { courseTitle } from "@/core/people";
import { db } from "@/lib/db";
import { lmsCourses, lmsFiles, uploads } from "@/lib/db/schema";
import { objectExists, putObject } from "@/lib/storage";
import { LMS_MATCH_AT, lmsScore, pdfText } from "@/server/upload-checks";
import { enqueueSyllabus } from "@/server/syllabus-queue";
import { invalidateUpload } from "@/server/views/cache";

export type ImportMeta = {
  channel: { id: string | number; name: string };
  postId: number | string;
  date?: string | null;
  text?: string | null;
  fileName: string;
  mime?: string | null;
  /** Only for a file too large to send for the plan: its hash and size, worked out by the sender. */
  sha256?: string | null;
  size?: number | null;
};

export type Duplicate = { kind: "upload" | "lms"; id: string; title: string; score: number; reason: "same bytes" | "same size" | "similar name" };

export type PlanRow = {
  sourceKey: string;
  postId: string;
  fileName: string;
  size: number;
  sha256: string;
  /** Already imported from this post: the upload id commit would update. */
  imported: string | null;
  duplicateOf: Duplicate | null;
  candidates: Candidate[];
  confidence: Confidence;
  type: FileType;
  exam: "midterm" | "final" | "quiz" | null;
  title: string;
  term: string | null;
  termFrom: string | null;
  week: number | null;
  flags: string[];
};

export class ImportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** One entry per course code: its catalog name and one LMS subject id to file it under. */
export async function importCourses(): Promise<Array<ImportCourse & { id: string }>> {
  const rows = await db().select({ id: lmsCourses.id, code: lmsCourses.code, name: lmsCourses.name }).from(lmsCourses).orderBy(desc(lmsCourses.fetchedAt), desc(lmsCourses.id));
  const byCode = new Map<string, ImportCourse & { id: string }>();
  for (const r of rows) if (r.code && !byCode.has(r.code)) byCode.set(r.code, { id: r.id, code: r.code, name: courseTitle(r.name) });
  return [...byCode.values()];
}

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const isPdf = (name: string, mime?: string | null, bytes?: Uint8Array | null) =>
  extensionOf(name) === "pdf" || mime === "application/pdf" || (!!bytes && Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-");

/** Text of the first two pages, or why it could not be read. */
async function readFile(name: string, mime: string | null | undefined, bytes: Uint8Array): Promise<{ text: string | null; problem: string | null }> {
  if (isPdf(name, mime, bytes)) {
    try {
      const text = await Promise.race([pdfText(bytes, 2), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15_000))]);
      return { text, problem: text.trim() ? null : "scanned (no text)" };
    } catch (error) {
      const name = (error as { name?: string })?.name;
      return { text: null, problem: name === "PasswordException" ? "password-protected" : "unreadable" };
    }
  }
  const head = Buffer.from(bytes.subarray(0, 4)).toString("hex");
  const ext = extensionOf(name);
  // docx/xlsx/pptx are zip files; a protected Office file is an OLE container instead.
  if (/^(docx|xlsx|pptx)$/.test(ext) && head !== "504b0304") return { text: null, problem: head === "d0cf11e0" ? "password-protected" : "unreadable" };
  return { text: null, problem: null };
}

async function duplicates(a: { sha256: string; size: number; fileName: string; sourceKey: string; code: string | null }) {
  const same = await db()
    .select({ id: uploads.id, title: uploads.title, sourceKey: uploads.sourceKey, code: uploads.courseCode })
    .from(uploads)
    .where(and(eq(uploads.sha256, a.sha256), ne(uploads.status, "rejected")));
  const imported = same.find((u) => u.sourceKey === a.sourceKey)?.id ?? null;
  const other = same.find((u) => u.sourceKey !== a.sourceKey);
  if (other) return { imported, duplicateOf: { kind: "upload" as const, id: other.id, title: `${other.title} · ${other.code ?? ""}`.trim(), score: 1, reason: "same bytes" as const } };
  if (!a.code) return { imported, duplicateOf: null };

  const [files, ups] = await Promise.all([
    db().select({ id: lmsFiles.id, name: lmsFiles.name, size: lmsFiles.size }).from(lmsFiles).where(eq(lmsFiles.code, a.code)),
    db()
      .select({ id: uploads.id, name: uploads.fileName, size: uploads.size, title: uploads.title, sourceKey: uploads.sourceKey })
      .from(uploads)
      .where(and(eq(uploads.courseCode, a.code), ne(uploads.status, "rejected"))),
  ]);
  let best: Duplicate | null = null;
  const consider = (kind: Duplicate["kind"], id: string, title: string, f: { name: string; size: number | null }) => {
    const score = lmsScore({ name: a.fileName, size: a.size }, f);
    if (score < LMS_MATCH_AT || (best && best.score >= score)) return;
    best = { kind, id, title, score, reason: f.size === a.size ? "same size" : "similar name" };
  };
  for (const f of files) consider("lms", f.id, f.name, f);
  for (const u of ups) if (u.sourceKey !== a.sourceKey) consider("upload", u.id, u.title, u);
  return { imported, duplicateOf: best as Duplicate | null };
}

const describe = (m: ImportMeta) => ({
  sourceKey: sourceKeyOf(m.channel.id, m.postId),
  text: (m.text ?? "").slice(0, 4000),
  date: exportDate(m.date),
  fileName: m.fileName.replace(/[\r\n]+/g, " ").trim(),
});

/** What one file from the export looks like. Writes nothing. `bytes` may be null only for a very large file whose hash and size are given. */
export async function planImport(meta: ImportMeta, bytes: Uint8Array | null): Promise<PlanRow> {
  const { sourceKey, text, date, fileName } = describe(meta);
  if (!bytes && !(meta.sha256 && /^[0-9a-f]{64}$/.test(meta.sha256) && meta.size && meta.size > LARGE_BYTES)) {
    throw new ImportError("A file is required (only a very large file may be planned from its hash and size)");
  }
  const size = bytes ? bytes.length : meta.size!;
  const sha256 = bytes ? sha(bytes) : meta.sha256!;
  const flags: string[] = [];
  if (size > LARGE_BYTES) flags.push(`very large (${Math.round(size / 1024 / 1024)} MB)`);
  const notCourse = notCourseFile(fileName, text);
  if (notCourse) flags.push(`not a course file: ${notCourse}`);

  const courses = await importCourses();
  let candidates = courseCandidates({ fileName, text }, courses);
  // The PDF's first pages only when the name and post name no course.
  let read: { text: string | null; problem: string | null } = { text: null, problem: null };
  if (bytes && size <= LARGE_BYTES) read = await readFile(fileName, meta.mime, bytes);
  if (read.problem) flags.push(read.problem);
  if (!candidates.some((c) => c.score >= 0.6) && read.text) candidates = courseCandidates({ fileName, text, pdfText: read.text }, courses);
  const confidence = confidenceOf(candidates);
  if (confidence === "none" && !notCourse) flags.push("no course found");

  const type = typeGuess(fileName, text);
  if (type === "book") flags.push("textbook (check the copyright)");
  const exam = type === "exam" || type === "mock" ? examGuess(fileName, text) : null;
  const { term, from } = termOf(fileName, text, date);
  const top = candidates[0] ?? null;
  const title = titleGuess({ fileName, text, type, exam, term, course: top });
  const dup = await duplicates({ sha256, size, fileName, sourceKey, code: top?.code ?? null });
  return {
    sourceKey, postId: String(meta.postId), fileName, size, sha256, imported: dup.imported, duplicateOf: dup.duplicateOf,
    candidates, confidence, type, exam, title, term, termFrom: from, week: type === "lecture" || type === "practice" || type === "lab" ? weekGuess(fileName) : null, flags,
  };
}

/* ───────── commit ───────── */

export type ImportDecision = {
  course: string;
  type: FileType;
  title: string;
  term?: string | null;
  week?: number | null;
  exam?: "midterm" | "final" | "quiz" | null;
  skip?: boolean;
};

const TYPES: FileType[] = ["lecture", "practice", "lab", "exam", "mock", "notes", "assignment", "syllabus", "book", "other"];

export type CommitResult =
  | { result: "skipped"; sourceKey: string }
  | { result: "duplicate"; sourceKey: string; duplicateOf: string }
  | { result: "created" | "updated"; sourceKey: string; id: string; courseCode: string; syllabus?: string };

/** Publishes one reviewed file: the original into the bucket, a live upload row keyed by the post. */
export async function commitImport(meta: ImportMeta, bytes: Uint8Array, decision: ImportDecision, actor: string | null = null): Promise<CommitResult> {
  const { sourceKey, text, date, fileName } = describe(meta);
  if (decision.skip) return { result: "skipped", sourceKey };
  if (!TYPES.includes(decision.type)) throw new ImportError(`Unknown type ${decision.type}`);
  const title = decision.title?.trim();
  if (!title) throw new ImportError("A title is required");
  const code = String(decision.course ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const course = (await importCourses()).find((c) => c.code.toUpperCase() === code);
  if (!course) throw new ImportError(`Unknown course ${decision.course}`);
  if (decision.week != null && (!Number.isInteger(decision.week) || decision.week < 1 || decision.week > 20)) throw new ImportError("Week must be 1–20");

  const sha256 = sha(bytes);
  const [existing] = await db().select().from(uploads).where(eq(uploads.sourceKey, sourceKey));
  // The same bytes already on this course from someone else (or rejected before): keep theirs.
  const [copy] = await db()
    .select({ id: uploads.id })
    .from(uploads)
    .where(and(eq(uploads.sha256, sha256), or(eq(uploads.courseId, course.id), and(eq(uploads.courseCode, course.code), ne(uploads.status, "rejected"))), existing ? ne(uploads.id, existing.id) : undefined))
    .limit(1);
  if (copy) return { result: "duplicate", sourceKey, duplicateOf: copy.id };

  const ext = extensionOf(fileName) || "bin";
  const mimeType = meta.mime || "application/octet-stream";
  // Like the bot: the original only; the branded copy is made on demand (src/server/covers).
  const storageKey = `uploads/${sha256}.${ext}`;
  if (!(await objectExists(storageKey).catch(() => false))) await putObject(storageKey, Buffer.from(bytes), mimeType);

  const sourceLabel = `the channel ${meta.channel.name.trim()}`;
  const values = {
    courseId: course.id, courseCode: course.code, title, type: decision.type,
    exam: decision.type === "exam" || decision.type === "mock" ? decision.exam ?? null : null,
    term: decision.term?.trim() || null, week: decision.week ?? null,
    fileName, mimeType, size: bytes.length, sha256, storageKey, sourceKey, sourceLabel,
    // Hidden by a moderator stays hidden on a re-run.
    status: existing?.status === "hidden" ? ("hidden" as const) : ("live" as const), showName: false, uploaderId: null,
    checks: { originalKey: storageKey, imported: { channel: meta.channel.name, postId: String(meta.postId), date: meta.date ?? null, text: text.slice(0, 500), by: actor } },
    reviewedAt: new Date(),
  };
  let row: { id: string };
  let result: "created" | "updated";
  if (existing) {
    [row] = await db().update(uploads).set(values).where(eq(uploads.id, existing.id)).returning({ id: uploads.id });
    result = "updated";
  } else {
    const inserted = await db()
      .insert(uploads)
      .values({ ...values, ...(date ? { createdAt: date } : {}) })
      .onConflictDoUpdate({ target: uploads.sourceKey, set: values })
      .returning({ id: uploads.id });
    row = inserted[0];
    result = "created";
  }
  invalidateUpload(course.code);
  if (existing?.courseCode && existing.courseCode !== course.code) invalidateUpload(existing.courseCode);

  const out: CommitResult = { result, sourceKey, id: row.id, courseCode: course.code };
  if (decision.type === "syllabus" && isPdf(fileName, meta.mime, bytes)) {
    // Read by the operator, not here: queued with the stored file for download.
    const queued = await enqueueSyllabus({ courseCode: course.code, sourceKey, fileId: row.id, storageKey, name: fileName, origin: "import" });
    out.syllabus = queued ? "queued" : "already parsed";
  }
  return out;
}
