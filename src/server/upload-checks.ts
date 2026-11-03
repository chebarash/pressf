/**
 * Automatic checks on a student upload, run at intake (after the webhook has
 * answered) and stored in `uploads.checks` in the shape the admin reads
 * (`UploadChecks` in src/server/admin/rules.ts): a similar LMS file, a copy of
 * another upload, an exam that may still be running, personal data in a PDF.
 */
import { and, eq, ne, or } from "drizzle-orm";
import { cleanTitle } from "@/core/files";
import { WEEKS, type CalendarWeek } from "@/core/semester";
import { addDays, localDay, shortDate } from "@/core/time";
import { RECENT_EXAM_DAYS } from "@/core/uploads";
import { db } from "@/lib/db";
import { lmsFiles, uploads } from "@/lib/db/schema";
import type { UploadChecks } from "@/server/admin/rules";

/* ───────── LMS match ───────── */

const tokens = (s: string) =>
  new Set(
    s
      .normalize("NFKD")
      .toLowerCase()
      .replace(/\.[a-z0-9]{1,5}$/, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );

/** Dice similarity of the words in two file names, 0..1. */
export function nameSimilarity(a: string, b: string) {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  return (2 * both) / (x.size + y.size);
}

/** How likely an upload is one of the LMS files: same size is near-certain, else name likeness. */
export function lmsScore(upload: { name: string; size: number }, file: { name: string; size: number | null }) {
  const sim = nameSimilarity(upload.name, file.name);
  const sameSize = !!file.size && file.size === upload.size;
  return Math.round((sameSize ? Math.max(0.95, sim) : sim * 0.9) * 100) / 100;
}

export const LMS_MATCH_AT = 0.6;

/* ───────── exam timing ───────── */

/** "Fall 2026" → the calendar weeks of that term. */
function termWeeks(term: string | null | undefined, now: Date): CalendarWeek[] {
  const m = term?.match(/(fall|spring|summer)\s+(\d{4})/i);
  if (!m) {
    // No term picked: the exam weeks around today.
    const day = localDay(now);
    return WEEKS.filter((w) => w.starts <= addDays(day, 60) && w.ends >= addDays(day, -120));
  }
  const kind = m[1].toLowerCase();
  const year = m[2];
  const next = String(Number(year) + 1);
  // A fall term runs into January of the next year.
  return WEEKS.filter((w) => w.term === kind && (w.starts.startsWith(year) || (kind === "fall" && w.starts.startsWith(next) && w.starts.slice(5, 7) <= "02")));
}

/**
 * Exams and mocks only: when the matching exam weeks were (midterm / final
 * from the academic calendar) and whether they are running or ended less than
 * RECENT_EXAM_DAYS ago.
 */
export function examCheck(u: { type: string; exam?: string | null; term?: string | null }, now: Date): UploadChecks["exam"] | undefined {
  if (u.type !== "exam" && u.type !== "mock") return undefined;
  const kinds = u.exam === "midterm" ? ["midterm"] : u.exam === "final" ? ["final"] : ["midterm", "final"];
  const weeks = termWeeks(u.term, now).filter((w) => kinds.includes(w.kind)).sort((a, b) => a.starts.localeCompare(b.starts));
  if (!weeks.length) return { date: null, running: false };
  const day = localDay(now);
  const started = weeks.filter((w) => w.starts <= day);
  const week = started.at(-1) ?? weeks[0];
  const running = week.starts <= day && day <= addDays(week.ends, RECENT_EXAM_DAYS);
  // Not started yet counts as "may be running": answers before the exam are worse.
  return { date: shortDate(week.starts), running: running || !started.length };
}

/* ───────── personal data ───────── */

const PATTERNS: Array<[string, RegExp]> = [
  ["phone numbers", /(?:\+|\b)998[\s-]?\(?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/],
  ["emails", /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/],
  ["student IDs", /\b(?:student\s*(?:id|no|number)|id\s*(?:no|number)?)\s*[:#№]?\s*[A-Z]?\d{5,10}\b|\bU\d{6,9}\b/i],
];

/** Which kinds of personal data appear in a text. */
export function personalData(text: string): string[] {
  return PATTERNS.filter(([, re]) => re.test(text)).map(([label]) => label);
}

const PAGES = 3;
const PDF_TIMEOUT_MS = 8000;

/** Text of the first pages of a PDF; empty for scans or unreadable files. */
export async function pdfText(bytes: Uint8Array, pages = PAGES): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 }).promise;
  try {
    const out: string[] = [];
    for (let i = 1; i <= Math.min(pages, pdf.numPages); i++) {
      const page = await pdf.getPage(i);
      const items = (await page.getTextContent()).items as Array<{ str?: string }>;
      out.push(items.map((t) => t.str ?? "").join(" "));
    }
    return out.join("\n");
  } finally {
    await pdf.destroy();
  }
}

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]).catch(() => fallback);

/* ───────── all checks ───────── */

export type CheckInput = {
  courseId: string;
  courseCode: string | null;
  courseName?: string;
  fileName: string;
  size: number;
  sha256: string;
  type: string;
  exam?: string | null;
  term?: string | null;
  /** The file itself; personal data is only looked for in PDFs. */
  bytes?: Uint8Array | null;
};

export async function uploadChecks(u: CheckInput, now = new Date()): Promise<UploadChecks> {
  const isPdf = /\.pdf$/i.test(u.fileName);
  const [files, copies, text] = await Promise.all([
    db()
      .select({ name: lmsFiles.name, size: lmsFiles.size, code: lmsFiles.code })
      .from(lmsFiles)
      .where(u.courseCode ? or(eq(lmsFiles.courseId, u.courseId), eq(lmsFiles.code, u.courseCode)) : eq(lmsFiles.courseId, u.courseId)),
    db()
      .select({ title: uploads.title, courseCode: uploads.courseCode, courseId: uploads.courseId })
      .from(uploads)
      .where(and(eq(uploads.sha256, u.sha256), ne(uploads.status, "rejected")))
      .limit(1),
    isPdf && u.bytes ? withTimeout(pdfText(u.bytes), PDF_TIMEOUT_MS, "") : Promise.resolve(null),
  ]);

  let best: { name: string; score: number } | null = null;
  for (const f of files) {
    const score = lmsScore({ name: u.fileName, size: u.size }, f);
    if (!best || score > best.score) best = { name: f.name, score };
  }
  const lms = best && best.score >= LMS_MATCH_AT ? { match: cleanTitle(best.name, { courseCode: u.courseCode ?? undefined, courseName: u.courseName }), score: best.score } : { match: null, score: null };
  const copy = copies[0];
  const checks: UploadChecks = {
    lms,
    duplicate: copy ? `${copy.title} · ${copy.courseCode ?? copy.courseId}` : false,
    personal: text === null ? null : personalData(text),
  };
  const exam = examCheck(u, now);
  if (exam) checks.exam = exam;
  if (checks.personal === null) delete checks.personal;
  return checks;
}
