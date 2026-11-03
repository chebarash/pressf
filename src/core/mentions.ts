/**
 * Which courses and professors an Anonymous channel post talks about. Pure
 * logic: the nightly sync compiles one matcher per run (src/lib/mentions.ts)
 * and runs every post through it.
 *
 * Courses are found by code ("MATH111", "math 111", "Math-111"; only codes the
 * LMS has) and by name or a common short name ("Calculus 1", "calc 1", "calc2",
 * "DLD" for Digital Logic Design), always as whole words, so "Calculus 1" never
 * matches "Calculus 2" or "Calculus 12". A name shared by two courses is skipped.
 *
 * Professors are found by surname and given name next to each other, in either
 * order, spelled any usual way (Xolmatov = Kholmatov = Холматов, see
 * `phonetic` in ./search), or by a surname that no other teacher has, given
 * a teaching word nearby ("prof Kayumov", "Kayumov's lecture"). Anything that
 * could be two people is skipped.
 *
 * Uzbek, Russian and English endings on the last word are allowed
 * ("Kayumovni", "algebradan", "Каюмова", "Kayumov's").
 */
import { createHash } from "node:crypto";
import { compact, editDistance, fold, phonetic } from "./search";

/** Bump when the rules change: the next sync re-matches every stored post. */
export const MATCHER_VERSION = 3;

export type MentionKind = "course" | "teacher";
export type MentionLink = { kind: MentionKind; target: string };
export type MentionCourse = { code: string; name: string };
export type MentionTeacher = {
  id: string;
  firstName?: string | null;
  /** The LMS puts the patronymic here; the family name only when `surName` is empty. */
  lastName?: string | null;
  surName?: string | null;
  /** An admin's display-name override ("Given Surname"). */
  displayName?: string | null;
};
export type MatcherInput = {
  courses: MentionCourse[];
  teachers: MentionTeacher[];
  /** Merged teachers: old id → the id kept. */
  aliases?: Record<string, string>;
  /** Study programme names: a course named like a programme ("Software Engineering") means the programme as often as the course. */
  programs?: string[];
};
export type Matcher = {
  /** Changes whenever the rules or the courses/teachers they use change. */
  fingerprint: string;
  match(text: string | null | undefined): MentionLink[];
};

/* ───────────── words ───────────── */

/** Endings a word may carry after a name: Uzbek cases and plurals, Russian cases, the English possessive. */
const SUFFIXES = [
  "larning", "lardan", "larga", "larni", "lari", "lar",
  "nikiga", "nikida", "niki", "ning", "dagi", "dan", "ten", "tan", "dek", "day", "cha", "chi",
  "ga", "ka", "qa", "da", "ta", "ni", "mi", "ku",
  "ym", "im", "om", "oi", "oy", "ei", "ey", "u", "a", "e",
  "s",
].sort((a, b) => b.length - a.length);

/** A word and the stems it may be once an ending is taken off (stems of 3+ letters). */
function stems(word: string): string[] {
  const out = [word];
  for (const suffix of SUFFIXES) {
    if (word.length - suffix.length >= 3 && word.endsWith(suffix)) out.push(word.slice(0, -suffix.length));
  }
  return out;
}

/** Folded words, letters and digits apart ("calc2" → calc, 2; "MATH-111" → math, 111). */
export function tokens(text: string | null | undefined): string[] {
  const out: string[] = [];
  for (const w of fold(text).split(" ")) {
    if (!w) continue;
    for (const part of w.split(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/)) if (part) out.push(part);
  }
  return out;
}

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5" };
const isNumberWord = (w: string | undefined) => !!w && (/^\d{1,2}$/.test(w) || w === "ii" || w === "iii" || w === "iv");

/* ───────────── courses ───────────── */

/** Little words left out of acronyms ("Algorithms and Data Structures" → ads). */
const FILLER = new Set(["and", "of", "the", "to", "in", "for", "a", "an", "on", "with"]);
/** Short forms students use for a word of a course name. */
const ABBR: Record<string, string[]> = {
  calculus: ["calc"],
  computer: ["comp"],
  programming: ["prog"],
  introduction: ["intro"],
  statistics: ["stats", "stat"],
  probability: ["prob"],
  economics: ["econ"],
  microeconomics: ["micro"],
  macroeconomics: ["macro"],
  mathematics: ["math", "maths"],
  physics: ["phys"],
  chemistry: ["chem"],
  engineering: ["eng"],
  mechanics: ["mech"],
};
/** Nicknames that aren't built from the name, keyed by the folded name. */
const NICKNAMES: Record<string, string[]> = {
  "computer programming 2": ["oop"],
  "probability and statistics": ["prob stat", "probstat"],
  "linear algebra": ["linal"],
};
/** One-word names too common to mean the course on their own. */
const GENERIC = new Set([
  "teaching", "research", "management", "english", "mathematics", "math", "economics", "physics", "chemistry", "biology", "history",
  "philosophy", "design", "programming", "statistics", "internship", "seminar", "project", "thesis", "practice", "ethics", "finance",
  "marketing", "accounting", "networks", "databases", "algorithms", "probability", "writing", "reading", "speaking", "listening",
  "medicine", "law", "art", "music", "sport", "sports", "language", "literature", "psychology", "sociology", "robotics", "dynamics", "statics",
]);
/** Acronyms that are everyday words (in English, Uzbek or chat). */
const STOP_ACRONYMS = new Set([
  "the", "and", "for", "you", "are", "can", "not", "how", "who", "why", "all", "any", "but", "has", "had", "was", "use", "ask", "get", "got",
  "bor", "bir", "ham", "men", "sen", "biz", "siz", "nma", "pdf", "gpa", "sat", "lol", "omg", "pls", "plz", "idk", "imo", "btw", "fyi",
  "mid", "fin", "lab", "max", "min", "art", "law", "oil", "gas", "map", "ram", "cpu", "gpu", "api", "app", "web", "dev", "new", "one",
  "cfa", "cpa", "acca", "ielts", "toefl", "edu", "pms", "dms", "sms", "www", "ppt", "doc", "hw", "tbh", "smh", "wtf", "brb", "asap",
]);

type Phrase = { words: string[]; target: string; /** `true`: may end with an Uzbek/Russian/English ending. */ endings: boolean };

/** The folded name with Roman numerals as digits ("Physics II" → physics 2). */
const nameWords = (name: string) => tokens(name).map((w, i, all) => (i > 0 && i === all.length - 1 && ROMAN[w] && w !== "v" ? ROMAN[w] : w));

/** Every way a course name may be written: the name, short words, a Roman numeral, "intro to", an acronym, a nickname. */
export function courseVariants(name: string): string[][] {
  const base = nameWords(name);
  if (!base.length) return [];
  const romanName = /\s(i|ii|iii|iv)$/i.test(name.trim());
  const out = new Map<string, string[]>();
  const add = (ws: string[]) => {
    const clean = ws.filter(Boolean);
    if (clean.length) out.set(clean.join(" "), clean);
  };
  const forms = [base];
  // "Introduction to Microeconomics" is also just "Microeconomics" when it has no number.
  if (base[0] === "introduction" && base[1] === "to" && base.length > 2) forms.push(base.slice(2));
  for (const ws of forms) {
    add(ws);
    // Short words: one at a time and all together (single short words alone are too loose).
    const options = ws.map((w) => [w, ...(ABBR[w] ?? [])]);
    const all = options.map((o) => o[o.length - 1]);
    if (ws.length > 1) {
      add(all);
      options.forEach((o, i) => o.slice(1).forEach((short) => add(ws.map((w, j) => (j === i ? short : w)))));
    }
    // Roman numeral ending; a lone "I" only when the name itself is written that way ("Physics I").
    const last = ws[ws.length - 1];
    const roman = Object.entries(ROMAN).find(([r, d]) => d === last && (r.length > 1 || romanName))?.[0];
    if (roman && ws.length > 1) add([...ws.slice(0, -1), roman]);
  }
  // Acronym of 3+ main words, the number kept apart ("Academic and Communication Skills 1" → acs 1).
  const number = isNumberWord(base[base.length - 1]) ? base[base.length - 1] : null;
  const main = (number ? base.slice(0, -1) : base).filter((w) => !FILLER.has(w));
  if (main.length >= 3 && main.every((w) => /^[a-z]/.test(w))) {
    const acronym = main.map((w) => w[0]).join("");
    // Two vowels make a word, not an acronym ("name" from Nanotechnology and Advanced Materials Engineering).
    if (!STOP_ACRONYMS.has(acronym) && (acronym.match(/[aeiou]/g)?.length ?? 0) < 2) add(number ? [acronym, number] : [acronym]);
  }
  for (const nick of NICKNAMES[base.join(" ")] ?? []) add(tokens(nick));
  return [...out.values()];
}

/** Whether a phrase is specific enough to stand for a course. */
function usable(words: string[], fullName: string[]): boolean {
  if (words.length > 1) return true;
  const [w] = words;
  if (/^\d/.test(w)) return false;
  // A one-word name, or an acronym/nickname of 3+ letters.
  if (fullName.length === 1) return w.length >= 5 && !GENERIC.has(w);
  return w.length >= 3 && !GENERIC.has(w) && !STOP_ACRONYMS.has(w);
}

/** "BSc in Software Engineering" → "software engineering". */
export const programmeKey = (name: string) =>
  tokens(name).join(" ").replace(/^(bachelor|master|bsc|ba|msc|ma|mba|bs|ms)( of)?( (science|arts|business administration))?( (in|of))? /, "");

function compileCourses(courses: MentionCourse[], programs: string[] = []) {
  const programmes = new Set(programs.map(programmeKey).filter(Boolean));
  const codes = new Map<string, string>();
  const byPhrase = new Map<string, { words: string[]; targets: Set<string>; loose: boolean }>();
  for (const c of courses) {
    const key = compact(c.code);
    if (key) codes.set(key, c.code);
    const full = nameWords(c.name);
    for (const words of courseVariants(c.name)) {
      if (!usable(words, full)) continue;
      const k = words.join(" ");
      // One word, or a name without its "Introduction to": loose enough to be the start of another course's name.
      const loose = words.length === 1 || (full[0] === "introduction" && words[0] !== "introduction" && words[0] !== "intro");
      const entry = byPhrase.get(k) ?? { words, targets: new Set<string>(), loose: false };
      entry.targets.add(c.code);
      entry.loose ||= loose;
      byPhrase.set(k, entry);
    }
  }
  // The courses each phrase is the start of ("calculus" → Calculus 1, Calculus 2; "data science" → Data Science Fundamentals).
  const startOf = new Map<string, Set<string>>();
  for (const { words, targets } of byPhrase.values()) {
    for (let n = 1; n < words.length; n++) {
      const head = words.slice(0, n).join(" ");
      const set = startOf.get(head) ?? new Set<string>();
      for (const t of targets) set.add(t);
      startOf.set(head, set);
    }
  }
  // A phrase that names two courses names neither; a loose one that starts another course's name too.
  const index = new Map<string, Phrase[]>();
  for (const [k, { words, targets, loose }] of byPhrase) {
    if (targets.size !== 1 || programmes.has(k)) continue;
    if (loose && [...(startOf.get(k) ?? [])].some((t) => !targets.has(t))) continue;
    const phrase = { words, target: [...targets][0], endings: !/^\d/.test(words[words.length - 1]) };
    const list = index.get(words[0]);
    if (list) list.push(phrase);
    else index.set(words[0], [phrase]);
  }
  for (const list of index.values()) list.sort((a, b) => b.words.length - a.words.length);
  return { codes, index };
}

/** Course codes in the text, as the LMS writes them. */
function findCodes(ws: string[], codes: Map<string, string>, out: Set<string>) {
  for (let i = 0; i < ws.length - 1; i++) {
    const letters = ws[i];
    const digits = ws[i + 1];
    if (!/^[a-z]{2,6}$/.test(letters) || !/^\d{3,4}$/.test(digits)) continue;
    // "CS101L": a letter right after the number may belong to the code.
    const next = ws[i + 2];
    const withLetter = next && /^[a-z]$/.test(next) ? codes.get(letters + digits + next) : undefined;
    const code = withLetter ?? codes.get(letters + digits);
    if (code) out.add(code);
  }
}

/** Course names: the longest phrase at each word wins, and a name never runs on into a number. */
function findNames(ws: string[], index: Map<string, Phrase[]>, out: Set<string>) {
  let i = 0;
  while (i < ws.length) {
    let best: Phrase | null = null;
    for (const first of stems(ws[i])) {
      for (const p of index.get(first) ?? []) {
        if (best && best.words.length >= p.words.length) continue;
        if (fits(ws, i, p)) best = p;
      }
    }
    if (best) {
      out.add(best.target);
      i += best.words.length;
    } else i++;
  }
}

function fits(ws: string[], i: number, p: Phrase): boolean {
  const n = p.words.length;
  if (i + n > ws.length) return false;
  for (let j = 0; j < n; j++) {
    const w = ws[i + j];
    const want = p.words[j];
    if (w === want) continue;
    // Endings only on the last word (or the only one): "algebradan", "dldni". A short word takes
    // no one-letter ending ("oops" is not OOP).
    if (j === n - 1 && p.endings && stems(w).some((s) => s === want && (want.length > 4 || w.length - s.length > 1))) continue;
    return false;
  }
  // "Calculus" must not be read out of "Calculus 2".
  const next = ws[i + n];
  if (!/^\d/.test(p.words[n - 1]) && isNumberWord(next)) return false;
  return true;
}

/* ───────────── teachers ───────────── */

/** Words near a surname that say it is a teacher (folded). */
const TEACHING = new Set([
  "prof", "professor", "professors", "profs", "teacher", "teachers", "lecturer", "lecturers", "instructor", "tutor", "dr", "mr", "mrs", "ms", "miss", "sir",
  "domla", "domlani", "domlaga", "domladan", "domlasi", "ustoz", "ustoza", "ustozni", "ustozga", "oqituvchi", "oqituvchisi", "muallim", "muallima",
  "prepod", "prepoda", "prepodavatel", "uchitel", "uchitelnitsa", "domlam", "ustozim",
  "lecture", "lectures", "class", "classes", "section", "sections", "course", "seminar", "lab", "labs", "tutorial", "grading", "grades", "exam", "midterm", "final",
  "dars", "darsi", "darsga", "darsini", "darslari", "guruh", "potok",
]);

type NameKey = { id: string; given: string[]; family: string[] };

/** Name words as compared: folded, then phonetic (kh/x/h, y/i, doubled letters). */
const nameWordsOf = (text: string | null | undefined) => fold(text).split(" ").filter(Boolean).map(phonetic);

function keysOf(t: MentionTeacher): Array<Omit<NameKey, "id">> {
  const out: Array<Omit<NameKey, "id">> = [];
  const given = nameWordsOf(t.firstName);
  const family = nameWordsOf(t.surName?.trim() ? t.surName : t.lastName);
  if (given.length && family.length) out.push({ given, family });
  const shown = nameWordsOf(t.displayName);
  if (shown.length >= 2) out.push({ given: shown.slice(0, 1), family: shown.slice(1) }, { given: shown.slice(0, -1).slice(0, 1), family: shown.slice(-1) });
  return out;
}

/** 2: same word; 1: a close spelling (Siyavush/Siyavushxon, Abdulaziz/Abduaziz); 0: different. */
function givenScore(want: string, got: string): number {
  if (want === got) return 2;
  const [short, long] = want.length <= got.length ? [want, got] : [got, want];
  if (short.length >= 4 && long.startsWith(short)) return 1;
  if (short.length >= 5 && editDistance(want, got, 1) <= 1) return 1;
  return 0;
}

function compileTeachers(teachers: MentionTeacher[], aliases: Record<string, string>) {
  const canonical = (id: string) => {
    let cur = id;
    for (let n = 0; n < 5 && aliases[cur] && aliases[cur] !== cur; n++) cur = aliases[cur];
    return cur;
  };
  const keys: NameKey[] = [];
  const seen = new Set<string>();
  for (const t of teachers) {
    const id = canonical(t.id);
    for (const k of keysOf(t)) {
      const sig = `${id}|${k.given.join(" ")}|${k.family.join(" ")}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      keys.push({ id, ...k });
    }
  }
  // By the last word of the family name.
  const byFamily = new Map<string, NameKey[]>();
  const givenWords = new Set<string>();
  for (const k of keys) {
    const last = k.family[k.family.length - 1];
    const list = byFamily.get(last);
    if (list) list.push(k);
    else byFamily.set(last, [k]);
    for (const g of k.given) givenWords.add(g);
  }
  // A surname alone points at one teacher only when nobody else has it, it is no one's given name, and it is long enough.
  const soleFamily = new Map<string, string>();
  for (const [last, list] of byFamily) {
    const ids = new Set(list.map((k) => k.id));
    if (ids.size === 1 && last.length >= 4 && !givenWords.has(last)) soleFamily.set(last, list[0].id);
  }
  const teacherIds = new Set(keys.map((k) => k.id));
  return { byFamily, soleFamily, teacherIds, fingerprint: keys.map((k) => `${k.id}:${k.given.join(" ")}:${k.family.join(" ")}`).sort().join("\n") };
}

function findTeachers(text: string, t: ReturnType<typeof compileTeachers>, out: Set<string>) {
  const raw = fold(text).split(" ").filter(Boolean);
  const ws = raw.map(phonetic);
  // Each word with its endings taken off, compared phonetically.
  const forms = raw.map((w) => [...new Set(stems(w).map(phonetic))]);
  const near = (i: number, from: number, to: number) => {
    for (let j = Math.max(0, i + from); j <= Math.min(raw.length - 1, i + to); j++) if (j !== i && TEACHING.has(raw[j])) return true;
    return false;
  };
  for (let i = 0; i < ws.length; i++) {
    const found = new Map<string, number>();
    let surname: string | null = null;
    for (const form of forms[i]) {
      const list = t.byFamily.get(form);
      if (!list) continue;
      surname ??= form;
      for (const k of list) {
        // The rest of a multi-word family name sits right before its last word.
        const start = i - (k.family.length - 1);
        if (start < 0 || !k.family.slice(0, -1).every((w, j) => ws[start + j] === w)) continue;
        // The given name right before the family name or right after it, endings allowed.
        let score = 0;
        for (const at of [start - 1, i + 1]) {
          if (at < 0 || at >= ws.length) continue;
          for (const g of k.given) for (const f of new Set([ws[at], ...forms[at]])) score = Math.max(score, givenScore(g, f));
        }
        if (score) found.set(k.id, Math.max(found.get(k.id) ?? 0, score));
      }
    }
    if (found.size) {
      const exact = [...found].filter(([, s]) => s === 2).map(([id]) => id);
      const pick = exact.length ? exact : [...found.keys()];
      // Two people with this name: say nothing.
      if (pick.length === 1) out.add(pick[0]);
      continue;
    }
    if (!surname) continue;
    const sole = t.soleFamily.get(surname);
    if (sole && near(i, -3, 3)) out.add(sole);
  }
}

/* ───────────── the matcher ───────────── */

export function compileMatcher(input: MatcherInput): Matcher {
  const courses = compileCourses(input.courses, input.programs);
  const teachers = compileTeachers(input.teachers, input.aliases ?? {});
  const fingerprint = createHash("sha1")
    .update(`v${MATCHER_VERSION}\n`)
    .update([...new Set(input.courses.map((c) => `${c.code}:${c.name}`))].sort().join("\n"))
    .update("\n--\n")
    .update([...new Set((input.programs ?? []).map(programmeKey))].sort().join("\n"))
    .update("\n--\n")
    .update(teachers.fingerprint)
    .digest("hex")
    .slice(0, 16);
  return {
    fingerprint,
    match(text) {
      if (!text) return [];
      const ws = tokens(text);
      const codes = new Set<string>();
      findCodes(ws, courses.codes, codes);
      findNames(ws, courses.index, codes);
      const people = new Set<string>();
      findTeachers(text, teachers, people);
      return [
        ...[...codes].sort().map((target) => ({ kind: "course" as const, target })),
        ...[...people].sort().map((target) => ({ kind: "teacher" as const, target })),
      ];
    },
  };
}

/** The key of one link, as hidden links are stored. */
export const linkKey = (postId: number, kind: MentionKind, target: string) => `${postId}|${kind}|${target}`;
