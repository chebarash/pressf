import { SITE_URL } from "@/core/links";

/** Where a file came from; picks the cover variant (Cover/A4 · LMS, · From students, · Past exam). */
export type CoverSource = "lms" | "students" | "exam";

/** Everything a cover says about a file. Only `title`, `courseName`, `source` and `url` are required. */
export type CoverMeta = {
  /** "Limits and continuity", "Midterm exam, Fall 2025". */
  title: string;
  courseName: string;
  /** "MATH 111". */
  courseCode?: string | null;
  /** The semester the file belongs to, "Fall 2026". */
  term?: string | null;
  source: CoverSource;
  /** The file kind shown as a tag, e.g. "Lecture", "Notes" (exams always say "Past exam"). */
  kind?: string | null;
  week?: number | null;
  /** Extra week text: "8–12 Sep", "midterms". */
  weekNote?: string | null;
  /** "Gonçalo Pinto" (given name + surname only). */
  teacher?: string | null;
  /** "lecture", "lab". */
  teacherRole?: string | null;
  /** LMS upload date. */
  uploadedAt?: Date | null;
  /** Student uploader's name, only when they opted in. */
  uploaderName?: string | null;
  /** Past exams: what and when, so nobody mistakes it for a current paper. */
  exam?: { name?: string | null; date?: Date | null; minutes?: number | null; term?: string | null } | null;
  /** Pages of the original (filled in by the PDF brander when omitted). */
  pages?: number | null;
  /** The file page in Press F, encoded in the QR. */
  url: string;
};

export const SITE_HOST = new URL(SITE_URL).host;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "8 Sep 2026" in Tashkent time (UTC+5, no DST). */
export function fmtDate(d: Date) {
  const t = new Date(d.getTime() + 5 * 3600_000);
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}

export function weekLine(m: CoverMeta) {
  if (m.week == null && !m.weekNote) return null;
  return [m.week, m.weekNote].filter((v) => v != null && v !== "").join(" · ");
}

export function sourceLine(m: CoverMeta) {
  if (m.source === "lms") return m.uploadedAt ? `NewUU LMS, uploaded ${fmtDate(m.uploadedAt)}` : "NewUU LMS";
  return m.uploaderName ? `Shared by ${m.uploaderName}, checked by a moderator` : "Shared by a student, checked by a moderator";
}

export function examLine(m: CoverMeta) {
  const e = m.exam;
  if (!e) return null;
  const parts = [e.name, e.date ? fmtDate(e.date) : e.term ?? m.term, e.minutes ? `${e.minutes} min` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** "Calculus 1 · Fall 2026" or, for exams, "Calculus 1 · exam from Fall 2025". */
export function subtitle(m: CoverMeta) {
  const term = m.source === "exam" ? (m.exam?.term ?? m.term) : m.term;
  if (!term) return m.courseName;
  return m.source === "exam" ? `${m.courseName} · exam from ${term}` : `${m.courseName} · ${term}`;
}

export function detailRows(m: CoverMeta, pages: number | null | undefined): Array<[string, string]> {
  const rows: Array<[string, string | null]> = [
    ["Exam", m.source === "exam" ? examLine(m) : null],
    ["Week", weekLine(m)],
    ["Teacher", m.source === "lms" && m.teacher ? [m.teacher, m.teacherRole].filter(Boolean).join(", ") : null],
    ["Source", sourceLine(m)],
    ["Pages", pages ? `${pages} after this cover` : null],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}

export function tags(m: CoverMeta): Array<{ label: string; fill: "teal" | "mustard" | "rust" | "plum" }> {
  const out: Array<{ label: string; fill: "teal" | "mustard" | "rust" | "plum" }> = [];
  if (m.courseCode) out.push({ label: m.courseCode, fill: "teal" });
  if (m.source === "exam") out.push({ label: "Past exam", fill: "rust" });
  else if (m.kind) out.push({ label: m.kind, fill: "mustard" });
  if (m.source !== "lms") out.push({ label: "From students", fill: "plum" });
  return out;
}

export const SCAN_NOTE = "Scan to open this file in Press F — the week, other files and what students say about the course.";
export function legalNote(m: CoverMeta) {
  return m.source === "lms"
    ? "Original © its author / New Uzbekistan University. Shared for students of the course. Not an official NewUU document."
    : "Shared by students for students. Report a problem: ⋯ → Report in Press F. Not an official NewUU document.";
}
