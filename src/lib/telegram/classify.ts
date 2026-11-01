import type { MaterialKind } from "@/lib/db/schema";

export type KnownCourse = { code: string; name: string };

export type Classification = {
  courseCode: string | null;
  courseName: string | null;
  type: MaterialKind | null;
  term: string | null;
  hasSolutions: boolean;
  author: string | null;
};

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[_\-.,:;()[\]#]+/g, " ")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

/** Drops channel signatures so a handle is never read as a course or author. */
const stripHandles = (text: string): string => text.replace(/@\w+/g, " ");

const NOT_A_COURSE = new Set(["THE", "FOR", "AND", "WEEK", "YEAR", "ROOM", "PAGE", "PART"]);

function findCode(text: string): string | null {
  // Lookarounds, not \b: "_" counts as a word character, and file names use it.
  const pattern = /(?<![A-Za-z])([A-Za-z]{2,5})[\s_-]?(\d{3,4})(?!\d)/g;
  for (const [, prefix, digits] of text.matchAll(pattern)) {
    const upper = prefix.toUpperCase();
    if (NOT_A_COURSE.has(upper)) continue;
    // "Aug 2025" has the same shape as "SE2010", so a year needs a real code prefix.
    if (/^(19|20)\d{2}$/.test(digits) && prefix !== upper) continue;
    return `${upper}${digits}`;
  }
  return null;
}

/** Whole-word match on the longest course name, so "Calculus 1" beats "Calculus". */
function findCourse(text: string, courses: KnownCourse[]): KnownCourse | null {
  const haystack = ` ${normalize(text)} `;
  const sorted = [...courses].sort((a, b) => b.name.length - a.name.length);
  return (
    sorted.find((course) => haystack.includes(` ${normalize(course.name)} `)) ??
    null
  );
}

function findType(text: string): MaterialKind | null {
  const t = text.toLowerCase();
  if (/syllabus/.test(t)) return "syllabus";
  if (/\bmock/.test(t)) return "mock";
  if (/mid[\s_-]?term/.test(t)) return "midterm";
  if (/\bfinal|\bresit|\bretake/.test(t)) return "final";
  if (/\btextbook|\bedition\b|\bbook\b/.test(t)) return "textbook";
  if (/\bnotes?\b|\blecture|\bslides?\b/.test(t)) return "notes";
  return null;
}

function findTerm(text: string): string | null {
  const seasons = "fall|spring|spr|summer|winter";
  const direct = text.match(
    new RegExp(`(?<![a-z])(${seasons})[\\s_-]*(?:20)?(\\d{2})(?!\\d)`, "i")
  );
  const reversed = text.match(
    new RegExp(`(?<!\\d)20(\\d{2})[\\s_-]*(${seasons})(?![a-z])`, "i")
  );
  const season = direct?.[1] ?? reversed?.[2];
  const year = direct?.[2] ?? reversed?.[1];
  if (!season || !year) return null;
  const lower = season.toLowerCase();
  const name = lower === "spr" ? "Spring" : lower[0].toUpperCase() + lower.slice(1);
  return `${name} 20${year}`;
}

function findAuthor(text: string): string | null {
  const match = text.match(/(?<![A-Za-z])by[\s_-]*([A-Z][A-Za-z]{2,})/);
  return match ? match[1] : null;
}

/**
 * Guesses metadata from a file name and caption. A wrong guess is corrected by a
 * reviewer, so this stays a small set of rules rather than a model call.
 */
export function classify(
  fileName: string,
  caption: string | null | undefined,
  courses: KnownCourse[]
): Classification {
  const text = stripHandles(`${caption ?? ""}\n${fileName}`);
  const course = findCourse(text, courses);
  const code = findCode(text);
  const byCode = code ? courses.find((c) => c.code === code) : undefined;
  const type = findType(text);

  return {
    courseCode: byCode?.code ?? code ?? course?.code ?? null,
    courseName: byCode?.name ?? course?.name ?? null,
    type,
    term: findTerm(text),
    hasSolutions: /solution|answers?\b|answerts|marking scheme/i.test(text),
    author: type === "mock" ? findAuthor(text) : null,
  };
}
