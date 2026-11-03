/**
 * File naming. LMS files arrive as "Week 3_L5.pdf" or "MATH111 Lecture 5 (1).pptx";
 * we show a human title, and the week, type and format separately — never
 * repeated inside the title.
 */

export type FileType = "lecture" | "practice" | "lab" | "exam" | "mock" | "notes" | "assignment" | "syllabus" | "book" | "other";
export type FileFormat = "pdf" | "word" | "slides" | "sheet" | "image" | "video" | "audio" | "archive" | "code" | "link" | "other";
export type FileSource = "lms" | "students";

export const FORMAT_CODE: Record<FileFormat, string> = {
  pdf: "PDF", word: "DOC", slides: "PPT", sheet: "XLS", image: "IMG", video: "MP4", audio: "MP3", archive: "ZIP", code: "PY", link: "URL", other: "FILE",
};

export const TYPE_LABEL: Record<FileType, string> = {
  lecture: "Lecture", practice: "Practice", lab: "Lab", exam: "Past exam", mock: "Mock", notes: "Notes", assignment: "Assignment", syllabus: "Syllabus", book: "Book", other: "File",
};

const EXT: Array<[FileFormat, RegExp]> = [
  ["pdf", /^pdf$/],
  ["word", /^(docx?|odt|rtf|txt|md)$/],
  ["slides", /^(pptx?|odp|key)$/],
  ["sheet", /^(xlsx?|ods|csv)$/],
  ["image", /^(png|jpe?g|gif|webp|heic|svg)$/],
  ["video", /^(mp4|mov|mkv|webm|avi)$/],
  ["audio", /^(mp3|m4a|wav|ogg|aac)$/],
  ["archive", /^(zip|rar|7z|tar|gz)$/],
  ["code", /^(py|ipynb|java|c|cpp|h|js|ts|m|r|sql|html|css)$/],
];

export const extensionOf = (name: string) => name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase() ?? "";

export function formatOf(name: string, extension?: string): FileFormat {
  if (/^https?:\/\//i.test(name)) return "link";
  const ext = (extension ?? extensionOf(name)).toLowerCase().replace(/^\./, "");
  return EXT.find(([, re]) => re.test(ext))?.[0] ?? "other";
}

const TYPE_RULES: Array<[FileType, RegExp]> = [
  ["syllabus", /syllab/i],
  ["mock", /\bmock\b/i],
  // Review slides and lectures about an exam are teaching material, not the exam paper.
  ["lecture", /\b(review|revision)\b.*\b(slides?|lecture)\b|\b(slides?|lecture)\b.*\b(review|revision)\b/i],
  ["exam", /\b(midterm|mid-term|final exam|finals?|exam|quiz)\b/i],
  ["assignment", /\b(assignment|homework|hw\s?\d|problem set|pset|project brief)\b/i],
  ["lab", /\b(lab|laboratory)\b|(^|[\s_-])LB\s?\d+\b/i],
  ["practice", /\b(practice|practical|tutorial|seminar|workshop|exercises?)\b|(^|[\s_-])[PT]\s?\d+\b/i],
  ["notes", /\b(notes?|solutions?|answers?|summary|cheat ?sheet)\b/i],
  ["book", /\b(textbook|book|chapter)\b/i],
  ["lecture", /\b(lecture|lec)\b|(^|[\s_-])L\s?\d+\b/i],
];

/** Underscores count as spaces, so "Week 3_L5" reads as "Week 3 L5". */
const words = (name: string) => name.replace(/_+/g, " ");

export function typeOf(name: string): FileType {
  const n = words(name);
  return TYPE_RULES.find(([, re]) => re.test(n))?.[0] ?? "other";
}

/** "Week 3", "W3", "week_03" → 3. */
export function weekOf(name: string): number | null {
  const m = words(name).match(/\b(?:week|wk|w)[\s-]*0?(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A readable title: no extension, no course code, no week prefix, no "(1)" or
 * "final_v2" noise, words split. Short codes like "L5" become "Lecture 5".
 */
export function cleanTitle(name: string, opts: { courseCode?: string; courseName?: string } = {}): string {
  let t = name.replace(/\.[A-Za-z0-9]{1,5}$/, "");
  t = t.replace(/[_]+/g, " ").replace(/\s*\((\d+|copy)\)\s*$/i, "");
  if (opts.courseCode) {
    // "CS412", "CS 412", "CS-412", "cs_412": letters and digits with anything (or nothing) between.
    const [, letters, digits] = opts.courseCode.replace(/\s+/g, "").match(/^([A-Za-z]+)(\d+[A-Za-z]?)$/) ?? [];
    const code = letters ? `${letters}[\\s\\-.]*${digits}` : opts.courseCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s?");
    t = t.replace(new RegExp(`(^|[^A-Za-z0-9])${code}(?![0-9])`, "ig"), "$1 ");
  }
  if (opts.courseName) {
    // The course name at the start or the end ("Deep Learning — Midterm Review", "Midterm review - deep_learning"),
    // its words split by spaces, hyphens or nothing ("DeepLearning").
    const words = opts.courseName.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const nameRe = words.join("[\\s\\-]*");
    const stripped = t.replace(new RegExp(`^\\s*${nameRe}\\s*[-:–—,.]?\\s*`, "i"), "").replace(new RegExp(`\\s*[-:–—,(]?\\s*${nameRe}\\s*\\)?\\s*$`, "i"), "");
    if (stripped.trim()) t = stripped;
  }
  t = t.replace(/\b(?:week|wk|w)[\s-]*0?\d{1,2}\b\s*[-:–—.]?/gi, " ");
  t = t.replace(/\b(final|v\d+|ver\d+|copy|new|upd(ated)?)\b\s*$/gi, "");
  t = t.replace(/(^|\s)L\s?(\d+)\b/g, "$1Lecture $2").replace(/(^|\s)P\s?(\d+)\b/g, "$1Practice $2").replace(/(^|\s)LB\s?(\d+)\b/g, "$1Lab $2").replace(/(^|\s)T\s?(\d+)\b/g, "$1Tutorial $2");
  t = t.replace(/\s*[-–—:]\s*/g, " — ").replace(/\s+/g, " ").replace(/^[\s—.]+|[\s—.]+$/g, "");
  return t ? cap(t) : "Untitled file";
}

/** "Lecture 1, Lecture 2, Syllabus and 7 more": titles, each once, at most three named. */
export function fileList(titles: string[], max = 3) {
  const unique = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
  const shown = unique.slice(0, max);
  const rest = unique.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ");
}

export type FileMeta = { title: string; type: FileType; format: FileFormat; week: number | null };

export function describeFile(name: string, opts: { courseCode?: string; courseName?: string; extension?: string } = {}): FileMeta {
  return { title: cleanTitle(name, opts), type: typeOf(name), format: formatOf(name, opts.extension), week: weekOf(name) };
}

/** Title for a student upload, built from the bot answers. */
export function uploadTitle(a: { type: FileType; exam?: "midterm" | "final" | "quiz"; term?: string; note?: string }) {
  if ((a.type === "exam" || a.type === "mock") && a.exam) {
    const exam = `${cap(a.exam)}${a.type === "mock" ? " mock" : " exam"}`;
    return a.term ? `${exam}, ${a.term}` : exam;
  }
  return a.note?.trim() ? cap(a.note.trim()) : TYPE_LABEL[a.type];
}

export type WeekGroup<T> = { week: number | null; files: T[] };

/** Files by week (ascending), files without a week last. */
export function byWeek<T extends { week: number | null }>(files: T[]): WeekGroup<T>[] {
  const map = new Map<number | null, T[]>();
  for (const f of files) map.set(f.week, [...(map.get(f.week) ?? []), f]);
  return [...map.entries()].sort(([a], [b]) => (a ?? 99) - (b ?? 99)).map(([week, list]) => ({ week, files: list }));
}

/** A safe, human download name: "Midterm exam, Fall 2025 — Calculus 1.pdf". */
export function downloadName(title: string, courseName: string, format: FileFormat, extension: string) {
  const base = `${title} — ${courseName}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const ext = extension || (format === "pdf" ? "pdf" : "");
  return ext ? `${base}.${ext}` : base;
}
