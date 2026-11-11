import type { ClassKind } from "./agenda";
import { WEEKS, type CalendarWeek } from "./semester";
import { addDays } from "./time";

/**
 * Quizzes, midterms, projects… from a course syllabus, put on real days.
 *
 * A syllabus says when assessments happen in its own words: "Week 5",
 * "Weeks 6–7", "Week 8 (midterm week)", "in-class quiz every Friday",
 * "Quiz 1 – Week 4; Quiz 2 – Week 9", "During lab sessions", "Final exam
 * period", or a date. Its weekly plan sometimes names one too ("Week 9:
 * Recursion. Quiz 2"). This reads both and places each assessment on the
 * student's own timetable, using the academic calendar's teaching-week
 * numbers: a "Week 5 quiz" lands on that course's first class of week 5, or on
 * the lab/tutorial when the syllabus names one.
 *
 * Nothing is invented: an assessment with no readable timing ("TBA",
 * "Throughout the semester", empty) is not placed, a dated one from another
 * year is not placed, and a day is marked "inferred" unless the syllabus
 * states it (a date, or a weekday such as "every Friday").
 */

export type MilestoneKind = "quiz" | "assignment" | "project" | "presentation" | "midterm" | "final" | "lab-report" | "other";

export type Milestone = {
  courseCode: string;
  kind: MilestoneKind;
  /** "Quiz 2", "Midterm exam", "Group project". */
  title: string;
  /** Percent of the grade, as the syllabus gives it (for all of `of` together when that is more than 1). */
  weight: number | null;
  /** How many items share `weight`: 1 for one item, 3 for "Quizzes 30%" in weeks 4, 8, 12, null for a recurring one ("every Friday"). */
  of: number | null;
  /** The day, YYYY-MM-DD; with `endDay` after it, sometime in that span (a week with no class of the course). */
  day: string;
  endDay: string;
  /** The class it is on, when the student has one that day. */
  classKey: string | null;
  /** "stated": the syllabus gives the day (a date, a weekday); "inferred": only the week, the day is ours. */
  certainty: "stated" | "inferred";
  /** The syllabus text it comes from ("Week 5", "Week 9: Recursion. Quiz 2"). */
  source: string;
};

export type MilestoneSyllabus = {
  course_code: string;
  assessment: Array<{ name: string; weight_percent: number | null; timing: string }>;
  topics_by_week: Array<{ week: string; topic: string }>;
};

/** One class of the student's, as the placement needs it. */
export type MilestoneClass = { key: string; code: string; kind: ClassKind; day: string; start: string };

type Session = Extract<ClassKind, "lecture" | "tutorial" | "lab">;

/** One "when" read from a timing text. */
type Slot = {
  label?: string;
  week?: number;
  /** Weeks a–b, a span with no single day. */
  range?: [number, number];
  /** Every teaching week. */
  every?: boolean;
  /** 1 Monday … 6 Saturday. */
  weekday?: number;
  date?: { y: number | null; m: number; d: number };
  /** "Final exam period", "midterm week": the course's exam then, if the timetable has it. */
  period?: "midterm" | "final";
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAY = "(monday|tuesday|wednesday|thursday|friday|saturday|mon|tue|tues|wed|thu|thur|thurs|fri|sat)";

/** What kind of assessment a name is. Projects and presentations win over "final" ("Final project"). */
export function milestoneKind(name: string): MilestoneKind {
  const t = name.toLowerCase();
  if (/lab(oratory)?\s*(report|work|assignment)s?|\blabs?\b/.test(t)) return "lab-report";
  if (/presentation|pitch|defen[cs]e|\bviva\b/.test(t)) return "presentation";
  if (/project|capstone|portfolio/.test(t)) return "project";
  if (/mid-?\s?term|mid-semester/.test(t)) return "midterm";
  if (/\bfinal\b/.test(t)) return "final";
  if (/quiz|\btests?\b|control work/.test(t)) return "quiz";
  if (/assignment|homework|\bhw\b|coursework|essay|problem sets?|\breports?\b|\bpaper\b|case stud/.test(t)) return "assignment";
  return "other";
}

/** "Quizzes" → "Quiz", "Assignments" → "Assignment": one of several. */
export function singular(name: string) {
  const s = name.trim().replace(/\s*\(.*\)\s*$/, "");
  if (/quizzes$/i.test(s)) return s.replace(/zes$/i, "");
  if (/(assignment|presentation|project|report|test|lab|essay|homework|paper|exam|quiz)s$/i.test(s)) return s.slice(0, -1);
  return s;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const norm = (s: string) => s.replace(/[–—‒−]/g, "-").replace(/\s+/g, " ").trim();
const monthOf = (m: string) => MONTHS.indexOf(m.slice(0, 3).toLowerCase()) + 1;

/** Dates in a text: "15 March 2027", "March 15", "2027-03-15", "15.03.2027", "15/03". */
function datesIn(text: string): Slot["date"][] {
  const out: NonNullable<Slot["date"]>[] = [];
  const t = text.toLowerCase();
  for (const m of t.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) out.push({ y: +m[1], m: +m[2], d: +m[3] });
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${MONTH}\\.?(?:,?\\s+(20\\d{2}))?\\b`, "g"))) out.push({ y: m[3] ? +m[3] : null, m: monthOf(m[2]), d: +m[1] });
  for (const m of t.matchAll(new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d{2}))?`, "g"))) out.push({ y: m[3] ? +m[3] : null, m: monthOf(m[1]), d: +m[2] });
  // Day first, as written here, with the year (a bare "5/6" is more likely weeks than a date): 15.03.2027, 15/03/2027.
  for (const m of t.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/g)) out.push({ y: +m[3], m: +m[2], d: +m[1] });
  return out.filter((d) => d.m >= 1 && d.m <= 12 && d.d >= 1 && d.d <= 31);
}

const weekdayIn = (t: string) => {
  const m = t.toLowerCase().match(new RegExp(`\\b${WEEKDAY}s?\\b`));
  return m ? WEEKDAYS.indexOf(m[1].slice(0, 3)) : undefined;
};

/** Week numbers in "week 5", "weeks 4, 8 and 12", "weeks 6-7", "w5". */
function weeksIn(t: string): { list: number[]; range: [number, number] | null } {
  const list: number[] = [];
  let range: [number, number] | null = null;
  for (const m of t.matchAll(/\b(?:weeks?|wk|w)\s*\.?\s*#?\s*(\d{1,2}(?:\s*(?:-|to|,|and|&|\/)\s*(?:weeks?\s*)?\d{1,2})*)/gi)) {
    const part = m[1];
    const r = part.match(/^(\d{1,2})\s*(?:-|to)\s*(\d{1,2})$/i);
    if (r) {
      const [a, b] = [+r[1], +r[2]];
      if (b > a) range = range ?? [a, b];
      continue;
    }
    for (const n of part.match(/\d{1,2}/g) ?? []) list.push(+n);
  }
  return { list: [...new Set(list)].filter((n) => n >= 1 && n <= 20), range };
}

const LABEL = /\b(quiz|test|assignment|project|presentation|lab report|lab|homework|hw|essay|midterm|mid-term|report|exam)\s*#?\s*(\d{1,2})\b/gi;

/** The "when"s of one timing text, in the order written. Empty when it says nothing placeable. */
export function readTiming(raw: string, name = ""): Slot[] {
  const text = norm(raw ?? "");
  if (!text) return [];
  const t = text.toLowerCase();
  const out: Slot[] = [];
  if (/^(tba|tbd|to be (announced|confirmed)|n\/?a|-)$/i.test(t)) return [];

  // "Quiz 1 - Week 4; Quiz 2 - Week 9", "Assignment 1: 12 March".
  const parts = text.split(/[;\n]|,(?=\s*(?:quiz|test|assignment|project|presentation|lab|homework|hw|essay|report|exam)\s*#?\s*\d)/i).map((p) => p.trim()).filter(Boolean);
  const labelled = parts.filter((p) => new RegExp(LABEL.source, "i").test(p) && (weeksIn(p).list.length || datesIn(p).length));
  if (labelled.length && labelled.length === parts.filter((p) => weeksIn(p).list.length || datesIn(p).length).length) {
    for (const p of labelled) {
      const lm = p.match(new RegExp(LABEL.source, "i"))!;
      const label = cap(`${lm[1].toLowerCase() === "hw" ? "Homework" : lm[1]} ${lm[2]}`);
      const day = weekdayIn(p);
      const dates = datesIn(p);
      if (dates.length) for (const d of dates) out.push({ label, date: d });
      else for (const w of weeksIn(p).list) out.push({ label, week: w, weekday: day });
    }
    return out;
  }

  const dates = datesIn(text);
  if (dates.length) return dates.map((d) => ({ date: d }));

  const weekday = weekdayIn(t);
  const { list, range } = weeksIn(t);
  if (!list.length && !range && (/\b(every|each|weekly)\b/.test(t) || /\bduring (?:the )?(?:lab|tutorial|seminar)s?\b/.test(t))) {
    return [{ every: true, weekday }];
  }
  if (list.length) return list.map((w) => ({ week: w, weekday }));
  if (range) return range[1] - range[0] <= 2 ? [{ range }] : [];
  if (/\b(final|exam|examination)s?\s+(period|week|session)|\bfinal exams?\b|\bexam week\b/.test(t) || (/\bfinals?\b/.test(t) && milestoneKind(name) === "final")) return [{ period: "final" }];
  if (/\bmid-?\s?term\s+(period|week|exams?)\b|mid-semester/.test(t)) return [{ period: "midterm" }];
  return [];
}

/** A session type named in the text ("lab quiz", "during tutorials"). */
function sessionIn(text: string): Session | null {
  const t = text.toLowerCase();
  if (/\blab(oratory)?s?\b/.test(t) && !/lab reports?/.test(t)) return "lab";
  if (/\blab(oratory)? sessions?\b/.test(t)) return "lab";
  if (/tutorial|seminar/.test(t)) return "tutorial";
  if (/lecture/.test(t)) return "lecture";
  return null;
}

/** The weeks of the term `day` falls in (fall or spring of that school year), from the published calendar. */
export function termWeeks(day: string, weeks = WEEKS): CalendarWeek[] {
  const at = weeks.find((w) => w.starts <= day && day <= addDays(w.ends, 2)) ?? weeks.find((w) => w.starts > day);
  if (!at) return [];
  return weeks.filter((w) => w.term === at.term && Math.abs(Date.parse(w.starts) - Date.parse(at.starts)) < 200 * 86_400_000);
}

const weekDays = (w: CalendarWeek) => ({ from: w.starts, to: addDays(w.ends, 1) });

/**
 * The milestones of one course's syllabus on the student's timetable.
 * `classes`: the student's classes (any course; only this course's are used)
 * for the whole term; `weeks`: that term's calendar weeks (`termWeeks`).
 */
export function syllabusMilestones(syllabus: MilestoneSyllabus, classes: MilestoneClass[], weeks: CalendarWeek[]): Milestone[] {
  const code = syllabus.course_code;
  const mine = classes.filter((c) => c.code === code).sort((a, b) => a.start.localeCompare(b.start));
  const numbered = new Map<number, CalendarWeek>();
  for (const w of weeks) if (w.week && !numbered.has(w.week)) numbered.set(w.week, w);
  const termFrom = weeks.reduce((a, w) => (!a || w.starts < a ? w.starts : a), "");
  const termTo = weeks.reduce((a, w) => (!a || w.ends > a ? addDays(w.ends, 1) : a), "");
  const out: Milestone[] = [];

  const pick = (from: string, to: string, kind: MilestoneKind, session: Session | null, weekday?: number) => {
    let list = mine.filter((c) => c.day >= from && c.day <= to);
    const exams = list.filter((c) => c.kind === "exam");
    if ((kind === "midterm" || kind === "final") && exams.length) return { c: exams[0], exam: true };
    list = list.filter((c) => c.kind !== "exam");
    if (weekday !== undefined) list = list.filter((c) => new Date(`${c.day}T12:00:00Z`).getUTCDay() === weekday);
    if (session) list = list.filter((c) => c.kind === session);
    return { c: list[0] ?? null, exam: false };
  };

  const dayOfWeek = (w: CalendarWeek, weekday: number) => {
    const { from } = weekDays(w);
    const mon = new Date(`${from}T12:00:00Z`).getUTCDay();
    return addDays(from, (weekday - mon + 7) % 7);
  };

  const place = (base: Omit<Milestone, "day" | "endDay" | "classKey" | "certainty">, slot: Slot, session: Session | null) => {
    if (slot.date) {
      const { m, d } = slot.date;
      const years = slot.date.y ? [slot.date.y] : [...new Set([termFrom.slice(0, 4), termTo.slice(0, 4)].map(Number))];
      const day = years.map((y) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`).find((x) => x >= termFrom && x <= termTo && !Number.isNaN(Date.parse(x)));
      // A date outside this term is another year's syllabus: never moved onto this one.
      if (!day) return;
      const { c } = pick(day, day, base.kind, session);
      out.push({ ...base, day, endDay: day, classKey: c?.key ?? null, certainty: "stated" });
      return;
    }
    if (slot.period) {
      const kind = slot.period === "final" ? "final" : "midterm";
      const span = weeks.filter((w) => w.kind === kind);
      if (!span.length) return;
      const { c, exam } = pick(span[0].starts, addDays(span.at(-1)!.ends, 1), kind, null);
      // Without the exam on the timetable the calendar's exam weeks already say it.
      if (c && exam) out.push({ ...base, day: c.day, endDay: c.day, classKey: c.key, certainty: "stated" });
      return;
    }
    if (slot.range) {
      const a = numbered.get(slot.range[0]);
      const b = numbered.get(slot.range[1]);
      if (a && b) out.push({ ...base, day: a.starts, endDay: b.ends, classKey: null, certainty: "inferred" });
      return;
    }
    if (slot.every) {
      for (const w of weeks.filter((x) => x.kind === "teaching" && x.week)) {
        const { from, to } = weekDays(w);
        const { c } = pick(from, to, base.kind, session, slot.weekday);
        // A recurring one only shows where there is such a class.
        if (c) out.push({ ...base, day: c.day, endDay: c.day, classKey: c.key, certainty: slot.weekday !== undefined ? "stated" : "inferred" });
      }
      return;
    }
    if (slot.week) {
      const w = numbered.get(slot.week);
      if (!w) return;
      const { from, to } = weekDays(w);
      const { c, exam } = pick(from, to, base.kind, session, slot.weekday);
      if (c) out.push({ ...base, day: c.day, endDay: c.day, classKey: c.key, certainty: exam || slot.weekday !== undefined ? "stated" : "inferred" });
      else if (slot.weekday !== undefined) {
        const day = dayOfWeek(w, slot.weekday);
        out.push({ ...base, day, endDay: day, classKey: null, certainty: "stated" });
      } else out.push({ ...base, day: w.starts, endDay: w.ends, classKey: null, certainty: "inferred" });
    }
  };

  for (const a of syllabus.assessment ?? []) {
    const name = norm(a.name ?? "");
    if (!name) continue;
    const slots = readTiming(a.timing ?? "", name);
    if (!slots.length) continue;
    const kind = milestoneKind(name);
    const session = sessionIn(`${a.timing} ${name}`);
    const weight = typeof a.weight_percent === "number" && Number.isFinite(a.weight_percent) ? a.weight_percent : null;
    const many = slots.length > 1;
    slots.forEach((slot, i) => {
      const title = slot.label ?? (many ? `${singular(name)} ${i + 1}` : slot.every ? singular(name) : name);
      place({ courseCode: code, kind: slot.label ? milestoneKind(slot.label) === "other" ? kind : milestoneKind(slot.label) : kind, title, weight, of: slot.every ? null : slots.length, source: norm(a.timing) }, slot, session);
    });
  }

  // The weekly plan: "Week 9: Recursion. Quiz 2".
  const fromPlan: Array<{ week: number; kind: MilestoneKind; title: string; source: string }> = [];
  for (const row of syllabus.topics_by_week ?? []) {
    const n = Number(String(row.week ?? "").match(/\d{1,2}/)?.[0]);
    const topic = norm(row.topic ?? "");
    if (!n || !topic) continue;
    const m = topic.match(/\b(quiz\s*#?\s*\d{1,2}|quiz\b|mid-?\s?term(?:\s+exam)?|final\s+exam|(?:group|student|team|project|final)\s+presentations?|presentations?\s+of\s+projects?|project\s+(?:due|submission|deadline)|(?:assignment|homework|essay)\s*#?\s*\d{0,2}\s+(?:due|deadline|submission)|test\s*#?\s*\d{1,2}|lab\s+report\s*#?\s*\d{0,2}\s*(?:due)?)/i);
    if (!m) continue;
    const label = cap(m[1].replace(/\s+/g, " ").replace(/\s*(due|deadline|submission)$/i, "").replace(/\s*#\s*/, " ").trim());
    fromPlan.push({ week: n, kind: milestoneKind(label), title: label, source: `Week ${n}: ${topic}` });
  }
  for (const p of fromPlan) {
    const w = numbered.get(p.week);
    if (!w) continue;
    // Already placed from the assessment table that week.
    const { from, to } = weekDays(w);
    if (out.some((x) => x.kind === p.kind && x.day <= to && x.endDay >= from)) continue;
    const same = (syllabus.assessment ?? []).filter((a) => milestoneKind(a.name ?? "") === p.kind);
    const weight = same.length === 1 && typeof same[0].weight_percent === "number" ? same[0].weight_percent : null;
    const of = fromPlan.filter((x) => x.kind === p.kind).length;
    place({ courseCode: code, kind: p.kind, title: p.title, weight, of, source: p.source }, { week: p.week }, sessionIn(p.source));
  }

  const seen = new Set<string>();
  return out
    .filter((m) => {
      const key = `${m.title}|${m.day}|${m.classKey ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title));
}

/** "10%", "30% for all 3", "10% in total"; null without a weight. */
export function weightLabel(m: Pick<Milestone, "weight" | "of">) {
  if (m.weight === null) return null;
  if (m.of === null) return `${m.weight}% in total`;
  return m.of > 1 ? `${m.weight}% for all ${m.of}` : `${m.weight}%`;
}

/** "Quiz 2 · 10% · from the syllabus (likely this lesson)", as the lesson panel shows it. */
export function milestoneLine(m: Pick<Milestone, "title" | "weight" | "of" | "certainty" | "classKey">) {
  const tail = m.certainty === "inferred" ? (m.classKey ? "from the syllabus (likely this lesson)" : "from the syllabus (likely this week)") : "from the syllabus";
  return [m.title, weightLabel(m), tail].filter(Boolean).join(" · ");
}

/** A stable id for one milestone (feed items, calendar UIDs). */
export const milestoneId = (m: Pick<Milestone, "courseCode" | "title" | "day">) => `syllabus:${m.courseCode}:${m.day}:${m.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
