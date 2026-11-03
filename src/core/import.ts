/**
 * Guessing what a file from a Telegram channel export is: which course, what
 * kind of file, which term, a clean title, and whether it is a course file at
 * all. Pure functions; the server adds the database (src/server/import.ts).
 */
import { cleanTitle, typeOf, uploadTitle, weekOf, type FileType } from "@/core/files";
import { fold } from "@/core/search";
import { termOfDate } from "@/core/semester";

export type ImportCourse = { code: string; name: string };

export type Candidate = { code: string; name: string; score: number; reason: string };

/* ───────── course codes ───────── */

/** "MATH 211", "ECON-202", "Phys111", "PHYS111_Midterm", "(ECON311)" → the codes, upper case, no gaps. */
export function codesIn(text: string): string[] {
  const out: string[] = [];
  const re = /(?<![A-Za-z])([A-Za-z]{2,5})[\s\-_.]?(\d{3})(?![0-9])/g;
  for (const m of text.matchAll(re)) {
    const code = `${m[1]}${m[2]}`.toUpperCase();
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

/* ───────── course names ───────── */

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5" };
const SMALL = new Set(["and", "of", "the", "in", "to", "for", "a", "an", "with"]);

/** Folded words, a letter–digit run split ("physics1" → physics 1), roman numerals as digits, "&" as "and". */
export function nameWords(text: string): string[] {
  return fold(text.replace(/&/g, " and "))
    .split(" ")
    .flatMap((w) => w.split(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/))
    .filter(Boolean)
    .map((w) => ROMAN[w] ?? w);
}

/** Whether a text word stands for a name word: the same, or its start of 4+ letters ("macro" for macroeconomics). */
const wordMatch = (text: string, name: string) => text === name || (text.length >= 4 && !/\d/.test(text) && name.startsWith(text));

type NameHit = { code: string; name: string; start: number; end: number; score: number; reason: string };

/**
 * Course names written in a text: the whole name in order (score 0.85), with
 * shortened words ("Macro 1", "Discrete Math", 0.75), or the initials of a
 * name of three or more words ("ACS 2", "OOP", 0.6). A name inside a longer
 * one found at the same place ("Linear Algebra" in "Advanced Linear Algebra") is dropped.
 */
export function namesIn(text: string, courses: ImportCourse[]): NameHit[] {
  const words = nameWords(text);
  const hits: NameHit[] = [];
  for (const c of courses) {
    const name = nameWords(c.name);
    if (!name.length) continue;
    for (let i = 0; i + name.length <= words.length; i++) {
      let exact = true;
      let ok = true;
      for (let k = 0; k < name.length; k++) {
        if (words[i + k] === name[k]) continue;
        if (wordMatch(words[i + k], name[k])) exact = false;
        else { ok = false; break; }
      }
      // A one-word name must be written out in full ("Topology", not "topo").
      if (ok && (exact || name.length > 1)) {
        hits.push({ code: c.code, name: c.name, start: i, end: i + name.length, score: exact ? 0.85 : 0.75, reason: exact ? `name "${c.name}"` : `shortened name "${c.name}"` });
        break;
      }
    }
    // Initials: "Academic and Communication Skills 1" → "acs 1", "Object Oriented Programming" → "oop".
    const main = name.filter((w) => !SMALL.has(w));
    const letters = main.filter((w) => !/^\d+$/.test(w));
    const number = main.length && /^\d+$/.test(main[main.length - 1]) ? main[main.length - 1] : null;
    if (letters.length >= 3) {
      const initials = letters.map((w) => w[0]).join("");
      for (let i = 0; i < words.length; i++) {
        if (words[i] !== initials) continue;
        if (number && words[i + 1] !== number) continue;
        hits.push({ code: c.code, name: c.name, start: i, end: i + (number ? 2 : 1), score: 0.6, reason: `initials "${initials.toUpperCase()}${number ? ` ${number}` : ""}"` });
        break;
      }
    }
  }
  // Drop hits covered by a longer hit (a course name inside another's).
  return hits.filter((h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start && o.name !== h.name));
}

/* ───────── candidates ───────── */

export type GuessInput = { fileName: string; text: string; pdfText?: string | null };

/**
 * The likeliest courses, best first, with a score (0–1) and why. A code in the
 * file name or the post that the catalog knows is near-certain; agreeing with a
 * name found there makes it certain. The PDF's own text only counts when the
 * name and post say nothing.
 */
export function courseCandidates(input: GuessInput, courses: ImportCourse[], limit = 3): Candidate[] {
  const byCode = new Map(courses.map((c) => [c.code.toUpperCase(), c]));
  const found = new Map<string, Candidate>();
  const add = (c: ImportCourse, score: number, reason: string) => {
    const cur = found.get(c.code);
    if (!cur) found.set(c.code, { code: c.code, name: c.name, score, reason });
    else if (score > cur.score) found.set(c.code, { ...cur, score: Math.max(score, cur.score), reason: `${reason}; ${cur.reason}` });
    else if (!cur.reason.includes(reason)) cur.reason = `${cur.reason}; ${reason}`;
  };

  const from = (text: string, where: string, codeScore: number, nameScale: number) => {
    const codes = codesIn(text).filter((code) => byCode.has(code));
    const names = namesIn(text, courses);
    for (const code of codes) add(byCode.get(code)!, codeScore, `code ${code} in the ${where}`);
    for (const h of names) add(byCode.get(h.code.toUpperCase()) ?? { code: h.code, name: h.name }, h.score * nameScale, `${h.reason} in the ${where}`);
    // Code and name agree.
    for (const code of codes) if (names.some((h) => h.code.toUpperCase() === code)) add(byCode.get(code)!, 1, `code and name agree in the ${where}`);
  };

  from(input.fileName, "file name", 0.95, 1);
  from(input.text, "post", 0.95, 1);
  const strong = [...found.values()].some((c) => c.score >= 0.6);
  if (!strong && input.pdfText) from(input.pdfText.slice(0, 6000), "PDF text", 0.8, 0.8);

  // Several courses sharing one name tie, so none of them reads as certain (confidenceOf).
  const list = [...found.values()].sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  return list.slice(0, limit).map((c) => ({ ...c, score: Math.round(c.score * 100) / 100 }));
}

export type Confidence = "high" | "ambiguous" | "none";

/** High: one clear winner of 0.85 or more, 0.15 ahead of the next. */
export function confidenceOf(candidates: Candidate[]): Confidence {
  const [a, b] = candidates;
  if (!a) return "none";
  if (a.score >= 0.85 && (!b || a.score - b.score >= 0.15)) return "high";
  return "ambiguous";
}

/* ───────── term ───────── */

const SEASON: Record<string, string> = { fall: "Fall", autumn: "Fall", spring: "Spring", spr: "Spring", summer: "Summer", sum: "Summer" };
const year = (y: string) => (y.length === 2 ? `20${y}` : y);

/** "Fall 2024", "fall24", "(2025 Fall)", "spr25", "Spring_2025" → "Fall 2024"…; null when none is written. */
export function termIn(text: string): string | null {
  const t = text.replace(/_/g, " ");
  const a = t.match(/(?<![a-z])(fall|autumn|spring|spr|summer)[\s\-.]*(20\d{2}|\d{2})(?!\d)/i);
  if (a) return `${SEASON[a[1].toLowerCase()]} ${year(a[2])}`;
  const b = t.match(/(?<!\d)(20\d{2})[\s\-.]*(fall|autumn|spring|summer)(?![a-z])/i);
  if (b) return `${SEASON[b[2].toLowerCase()]} ${b[1]}`;
  return null;
}

/** The term: written in the post, else in the file name, else the term the post was made in. */
export function termOf(fileName: string, text: string, postDate: Date | null): { term: string | null; from: "post" | "file name" | "date" | null } {
  const inText = termIn(text);
  if (inText) return { term: inText, from: "post" };
  const inName = termIn(fileName);
  if (inName) return { term: inName, from: "file name" };
  const byDate = postDate ? termOfDate(postDate) : null;
  return { term: byDate, from: byDate ? "date" : null };
}

/* ───────── type, exam, title ───────── */

/** Hashtags and @handles are channel noise: "#midterm" counts as the word, "@pumaterials" goes. */
export const postWords = (text: string) => text.replace(/@\w+/g, " ").replace(/#/g, " ").replace(/_/g, " ").replace(/\s+/g, " ").trim();

/** The channel's own hashtags say what a post is. */
const HASHTAGS: Array<[FileType, RegExp]> = [
  ["syllabus", /#syllab/i],
  ["mock", /#mock/i],
  ["exam", /#(midterm|final|exam|quiz)\b/i],
  ["book", /#(text)?books?\b/i],
];

export function typeGuess(fileName: string, text: string): FileType {
  const tagged = HASHTAGS.find(([, re]) => re.test(text))?.[0];
  if (tagged) return tagged;
  const byName = typeOf(fileName);
  const byText = typeOf(postWords(text));
  // The post usually says what it is better than a file called "solution.pdf".
  if (byText !== "other" && (byName === "other" || byName === "notes" || byName === "lecture")) return byText;
  if (byName === "other") return byText;
  return byName;
}

export function examGuess(fileName: string, text: string): "midterm" | "final" | "quiz" | null {
  const t = `${fileName.replace(/_/g, " ")} ${postWords(text)}`;
  if (/\bmid[\s-]?term/i.test(t)) return "midterm";
  if (/\bfinal|resit/i.test(t)) return "final";
  if (/\bquiz/i.test(t)) return "quiz";
  return null;
}

/** File names that say nothing: a hash, "file", "solution", "Syllabus0", "Book". */
const meaningless = (title: string) =>
  !/[a-z]{3,}/i.test(title) || title.split(/\s+/).some((w) => w.length >= 12 && /\d/.test(w) && /[a-z]/i.test(w)) || /^(file|book|solutions?|syllabus\s?\d*|untitled file|mock|final|document|scan\s?\d*)$/i.test(title.trim());

export function titleGuess(a: { fileName: string; text: string; type: FileType; exam: "midterm" | "final" | "quiz" | null; term: string | null; course?: ImportCourse | null }): string {
  const t = `${a.fileName} ${postWords(a.text)}`;
  if ((a.type === "exam" || a.type === "mock") && a.exam) {
    const base = uploadTitle({ type: a.type, exam: a.exam, term: a.term ?? undefined });
    const resit = /\bresit/i.test(t) ? "Resit — " : "";
    return `${resit}${base}${/solution|answer/i.test(t) ? ", with solutions" : ""}`;
  }
  if (a.type === "syllabus") return "Syllabus";
  const opts = { courseCode: a.course?.code, courseName: a.course?.name };
  const fromName = cleanTitle(a.fileName.replace(/(\.(docx?|pdf))+$/i, ".pdf"), opts).replace(/\s*\(\s*\)/g, "");
  if (!meaningless(fromName)) return fromName;
  const firstLine = postWords(a.text.replace(/#\w+/g, " ")).split(/\n/)[0] ?? "";
  const fromText = firstLine ? cleanTitle(firstLine, opts) : "";
  return fromText && !meaningless(fromText) ? fromText : uploadTitle({ type: a.type });
}

export const weekGuess = (fileName: string) => weekOf(fileName);

/* ───────── flags ───────── */

/** Not material of one course: calendars, course lists, exam timetables, forms. */
export function notCourseFile(fileName: string, text: string): string | null {
  const t = `${fileName} ${text}`;
  if (/academic\s+calendar|#calendar/i.test(t)) return "academic calendar";
  if (/list of (the )?offered courses|offered courses|pre-?registration/i.test(t)) return "list of offered courses";
  if (/exam (schedule|timetable)|schedule and rooms|published mid-?term exams/i.test(t)) return "exam schedule";
  return null;
}

/** Above this a file is flagged "very large" (and the plan skips reading it). */
export const LARGE_BYTES = 50 * 1024 * 1024;

/** The Telegram export date ("2025-02-20T14:03:11", Tashkent time without a zone) as a Date. */
export function exportDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}+05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Telegram rich text (a string, or an array of strings and {text} parts) as plain text. */
export function plainText(text: unknown): string {
  if (typeof text === "string") return text;
  if (Array.isArray(text)) return text.map((p) => (typeof p === "string" ? p : typeof p?.text === "string" ? p.text : "")).join("");
  return "";
}

export const sourceKeyOf = (channelId: string | number, postId: string | number) => `tg:${String(channelId).replace(/[^0-9A-Za-z_-]/g, "")}:${String(postId).replace(/[^0-9]/g, "")}`;
