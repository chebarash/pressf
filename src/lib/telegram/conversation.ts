import { cleanTitle, TYPE_LABEL, typeOf, uploadTitle, type FileType } from "@/core/files";
import { shownAs, UPLOAD_TYPES } from "@/core/uploads";
import type { BotMessage, InlineButton, InlineKeyboard } from "./api";
import { card, esc } from "./html";

/**
 * The share-a-file conversation (Figma 11.2–11.4) as pure data: a draft, the
 * events that change it and the message for each step. bot.ts does the I/O.
 *
 *   file → course → type → [exam + semester] → [show name?] → confirm → sending
 */

export type Step = "file" | "course" | "search" | "type" | "exam" | "name" | "confirm" | "sending";
export type Exam = "midterm" | "final" | "quiz";
export type CourseOption = { id: string; code: string; name: string };
export type DraftFile = { fileId: string; uniqueId: string; name: string; mime: string; size: number };

export type Draft = {
  /** Short id carried in button data, so buttons of an older draft do nothing. */
  id: string;
  step: Step;
  file?: DraftFile;
  /** The course from a start=upload_<CODE> link. */
  linked?: string;
  /** Course buttons on the course question. */
  courses: CourseOption[];
  course?: CourseOption;
  type?: FileType;
  exam?: Exam;
  /** A semester like "Fall 2025"; null = Older; absent = not picked yet. */
  term?: string | null;
  terms: string[];
  showName: boolean;
  /** "Shamsiddin A.", when we know the student's name. */
  name?: string | null;
};

export type Event =
  | { kind: "file"; file: DraftFile }
  | { kind: "course"; index: number }
  | { kind: "search" }
  | { kind: "results"; courses: CourseOption[] }
  | { kind: "type"; type: FileType }
  | { kind: "exam"; exam: Exam }
  | { kind: "term"; index: number }
  | { kind: "name"; show: boolean }
  | { kind: "edit" }
  | { kind: "send" };

/** Drafts left alone this long are dropped; their buttons answer "timed out". */
export const DRAFT_TTL_MS = 24 * 3600_000;
export const MAX_COURSE_BUTTONS = 8;
export const EXAMS: Exam[] = ["midterm", "final", "quiz"];
const EXAM_LABEL: Record<Exam, string> = { midterm: "Midterm", final: "Final", quiz: "Quiz" };

export const needsExam = (type?: FileType) => type === "exam" || type === "mock";

/** The current semester and the one before: Fall 2026 → [Fall 2026, Spring 2026]. */
export function recentTerms(now = new Date()): string[] {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() >= 7 ? [`Fall ${y}`, `Spring ${y}`] : [`Spring ${y}`, `Fall ${y - 1}`];
}

/** Guesses from the file name, shown as ✓ so one tap confirms them. */
export function guess(fileName: string, courses: CourseOption[], terms: string[]) {
  const name = fileName.replace(/[_]+/g, " ");
  const found = typeOf(fileName);
  const type = (UPLOAD_TYPES as FileType[]).includes(found) && found !== "other" ? found : undefined;
  const exam = /mid-?term/i.test(name) ? "midterm" : /\bfinal/i.test(name) ? "final" : /\bquiz/i.test(name) ? "quiz" : undefined;
  const flat = name.toLowerCase().replace(/[\s-]+/g, "");
  const course = courses.find((c) => flat.includes(c.code.toLowerCase().replace(/\s+/g, "")) || flat.includes(c.name.toLowerCase().replace(/\s+/g, "")));
  const term = terms.find((t) => {
    const [season, year] = t.toLowerCase().split(" ");
    return new RegExp(`${season}[\\s-]*(20)?${year.slice(2)}(?!\\d)`).test(name.toLowerCase());
  });
  return { type, exam: exam as Exam | undefined, course, term };
}

export function newDraft(a: { id: string; courses: CourseOption[]; name?: string | null; linked?: string; now?: Date }): Draft {
  const linkedCourse = a.linked ? a.courses.find((c) => c.code.toUpperCase() === a.linked!.toUpperCase()) : undefined;
  return {
    id: a.id,
    step: "file",
    linked: linkedCourse?.code,
    courses: a.courses.slice(0, MAX_COURSE_BUTTONS),
    course: linkedCourse,
    terms: recentTerms(a.now),
    showName: false,
    name: a.name ?? null,
  };
}

/** The next draft. Events that do not fit the step leave it unchanged. */
export function reduce(d: Draft, e: Event): Draft {
  switch (e.kind) {
    case "file": {
      const g = guess(e.file.name, d.courses, d.terms);
      return { ...d, file: e.file, step: "course", course: d.course ?? g.course, type: d.type ?? g.type, exam: d.exam ?? g.exam, term: d.term !== undefined ? d.term : g.term };
    }
    case "course": {
      if (d.step !== "course" || !d.courses[e.index]) return d;
      return { ...d, course: d.courses[e.index], step: "type" };
    }
    case "search":
      return d.step === "course" ? { ...d, step: "search" } : d;
    case "results":
      return d.step === "search" || d.step === "course" ? { ...d, courses: e.courses.slice(0, MAX_COURSE_BUTTONS), step: "course" } : d;
    case "type": {
      if (d.step !== "type") return d;
      if (needsExam(e.type)) return { ...d, type: e.type, step: "exam" };
      return { ...d, type: e.type, exam: undefined, term: undefined, step: afterExam(d) };
    }
    case "exam": {
      if (d.step !== "exam") return d;
      const next = { ...d, exam: e.exam };
      return next.term !== undefined ? { ...next, step: afterExam(d) } : next;
    }
    case "term": {
      if (d.step !== "exam" || e.index < 0 || e.index > d.terms.length) return d;
      const next = { ...d, term: e.index < d.terms.length ? d.terms[e.index] : null };
      return next.exam ? { ...next, step: afterExam(d) } : next;
    }
    case "name":
      return d.step === "name" ? { ...d, showName: e.show && !!d.name, step: "confirm" } : d;
    case "edit":
      return d.step === "confirm" ? { ...d, step: "course" } : d;
    case "send":
      return d.step === "confirm" ? { ...d, step: "sending" } : d;
  }
}

/** No name to show → no name question. */
const afterExam = (d: Draft): Step => (d.name ? "name" : "confirm");

/** The title the file goes live under (core uploadTitle). */
export function titleOf(d: Draft) {
  const note = d.file ? cleanTitle(d.file.name, { courseCode: d.course?.code, courseName: d.course?.name }) : "";
  return uploadTitle({ type: d.type ?? "other", exam: d.exam, term: d.term ?? undefined, note: note === "Untitled file" || /^photo$/i.test(note) ? "" : note });
}

/* ───────────── rendering ───────────── */

const tick = (on: boolean, label: string) => (on ? `✓ ${label}` : label);
const data = (d: Draft, ...parts: Array<string | number>) => ["u", d.id, ...parts].join(":");
const pairs = (buttons: InlineButton[]) => buttons.reduce<InlineButton[][]>((rows, b, i) => (i % 2 ? rows[rows.length - 1].push(b) : rows.push([b]), rows), []);

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const typeButtonLabel = (t: FileType) => TYPE_LABEL[t] === "File" ? "Other" : TYPE_LABEL[t];

function courseKeyboard(d: Draft): InlineKeyboard {
  const buttons = d.courses.map((c, i) => ({ text: tick(d.course?.id === c.id, c.name), callback_data: data(d, "c", i) }));
  return { inline_keyboard: pairs([...buttons, { text: "Another course…", callback_data: data(d, "cs") }]) };
}

const typeKeyboard = (d: Draft): InlineKeyboard => ({
  inline_keyboard: pairs(UPLOAD_TYPES.map((t) => ({ text: tick(d.type === t, typeButtonLabel(t)), callback_data: data(d, "t", t) }))),
});

const examKeyboard = (d: Draft): InlineKeyboard => ({
  inline_keyboard: pairs([
    ...EXAMS.map((x) => ({ text: tick(d.exam === x, EXAM_LABEL[x]), callback_data: data(d, "e", x) })),
    ...d.terms.map((t, i) => ({ text: tick(d.term === t, t), callback_data: data(d, "s", i) })),
    { text: tick(d.term === null, "Older"), callback_data: data(d, "s", d.terms.length) },
  ]),
});

const nameKeyboard = (d: Draft): InlineKeyboard => ({
  inline_keyboard: [
    [{ text: tick(!d.showName, "Keep me anonymous"), callback_data: data(d, "n", 0) }],
    [{ text: tick(d.showName, `Show '${d.name}'`), callback_data: data(d, "n", 1) }],
  ],
});

const confirmKeyboard = (d: Draft): InlineKeyboard => ({
  inline_keyboard: [[{ text: "Send for review", callback_data: data(d, "send") }, { text: "Edit", callback_data: data(d, "edit") }]],
});

/** The question for the draft's current step, with its buttons. */
export function render(d: Draft): BotMessage {
  switch (d.step) {
    case "file":
      return { text: "Send me the file and I'll ask where it goes." };
    case "course": {
      const linked = d.linked && d.course?.code === d.linked ? `You opened this from ${d.course.name}, so it's picked.` : null;
      return { text: card("Got it. Which course is it for?", linked), keyboard: courseKeyboard(d) };
    }
    case "search":
      return { text: card("Which course?", "Type its name or code, like Calculus 1 or MATH111.") };
    case "type":
      return { text: card("What is it?"), keyboard: typeKeyboard(d) };
    case "exam":
      return { text: card("Which exam and semester?"), keyboard: examKeyboard(d) };
    case "name":
      return { text: card("Show your name on it?", "If not, it shows as 'From students'."), keyboard: nameKeyboard(d) };
    case "confirm":
    case "sending": {
      const from = lowerFirst(shownAs(d.showName, d.name));
      const kind = lowerFirst(TYPE_LABEL[d.type ?? "other"]);
      const text = [
        "<b>Ready to send:</b>",
        `<b>${esc(titleOf(d))}</b>`,
        esc(`${d.course?.name ?? ""} · ${kind} · ${from}`),
        "By sending you confirm it's OK to share: no live-exam answers, no one's personal data.",
      ].join("\n");
      return { text, keyboard: d.step === "confirm" ? confirmKeyboard(d) : undefined };
    }
  }
}

/** What the student picked at a step, shown under the answered question. */
export function answer(d: Draft, step: Step): string | null {
  switch (step) {
    case "course": return d.course ? `${d.course.name} ✓` : null;
    case "type": return d.type ? `${typeButtonLabel(d.type)} ✓` : null;
    case "exam": return d.exam ? `${[EXAM_LABEL[d.exam], d.term === null ? "Older" : d.term].filter(Boolean).join(", ")} ✓` : null;
    case "name": return d.showName ? `Show '${d.name}' ✓` : "Keep me anonymous ✓";
    default: return null;
  }
}

/** The answered question: its text, the pick in bold, no buttons. */
export function answered(before: Draft, after: Draft): BotMessage {
  const pick = answer(after, before.step);
  return { text: pick ? `${render(before).text}\n\n<b>${esc(pick)}</b>` : render(before).text };
}

/** Button data: u:<draft>:<action>[:<value>], or "ok" for Got it. */
export function parseData(raw: string): { draft: string; event: Event | null } | null {
  const [u, draft, action, value] = raw.split(":");
  if (u !== "u" || !draft) return null;
  const n = Number(value);
  switch (action) {
    case "c": return { draft, event: Number.isInteger(n) ? { kind: "course", index: n } : null };
    case "cs": return { draft, event: { kind: "search" } };
    case "t": return { draft, event: (UPLOAD_TYPES as string[]).includes(value) ? { kind: "type", type: value as FileType } : null };
    case "e": return { draft, event: (EXAMS as string[]).includes(value) ? { kind: "exam", exam: value as Exam } : null };
    case "s": return { draft, event: Number.isInteger(n) ? { kind: "term", index: n } : null };
    case "n": return { draft, event: { kind: "name", show: value === "1" } };
    case "edit": return { draft, event: { kind: "edit" } };
    case "send": return { draft, event: { kind: "send" } };
    default: return { draft, event: null };
  }
}
