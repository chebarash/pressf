import calendar from "../../data/academic-calendar-2026-2027.json";
import { addDays, daysBetween, localDay, localWeekday } from "./time";

/**
 * The academic calendar: which week it is and what kind of week, always from the
 * published calendar, never from date arithmetic on the semester start.
 */

export type WeekKind = "registration" | "induction" | "teaching" | "midterm" | "final" | "break" | "resit_registration" | "resit_exam" | "other";
export type Term = "fall" | "spring" | "summer";
export type CalendarWeek = { order: number; label: string; starts: string; ends: string; note?: string; term: Term; week: number | null; kind: WeekKind };
export type Holiday = { date: string; name: string };

const HOLIDAY_NAMES: Record<string, string> = {
  "2026-09-01": "Independence Day",
  "2026-10-01": "Teachers' Day",
  "2026-12-08": "Constitution Day",
  "2027-03-08": "International Women's Day",
};

export const WEEKS = calendar.weeks as CalendarWeek[];
export const HOLIDAYS: Holiday[] = calendar.holidays.map((h) => ({ date: h.date, name: HOLIDAY_NAMES[h.date] ?? "Holiday" }));

/** The week containing `day` (the calendar lists Mon–Fri; Saturday and Sunday belong to the week that just ended). */
export function weekOf(day: string, weeks = WEEKS): CalendarWeek | null {
  return (
    weeks.find((w) => w.starts <= day && day <= w.ends) ??
    [...weeks].reverse().find((w) => w.ends < day && day <= addDays(w.ends, 2)) ??
    null
  );
}

export const holidayOn = (day: string, holidays = HOLIDAYS) => holidays.find((h) => h.date === day) ?? null;

/** Teaching weeks in a term (for "Week 8 of 16"). */
export const teachingWeeks = (term: Term, weeks = WEEKS) =>
  Math.max(0, ...weeks.filter((w) => w.term === term).map((w) => w.week ?? 0));

export type DayInfo = {
  day: string;
  week: CalendarWeek | null;
  /** "Week 8 of 16", "Midterm exams", "Break" … */
  label: string | null;
  holiday: Holiday | null;
  weekend: boolean;
  /** Classes are expected today (a teaching or exam weekday that is not a holiday). */
  studyDay: boolean;
};

const KIND_LABEL: Record<WeekKind, string> = {
  registration: "Course registration",
  induction: "Induction",
  teaching: "",
  midterm: "Midterm exams",
  final: "Final exams",
  break: "Break",
  resit_registration: "Resit registration",
  resit_exam: "Resit exams",
  other: "Grading",
};

export function weekLabel(week: CalendarWeek | null, weeks = WEEKS) {
  if (!week) return null;
  if (week.kind === "teaching" && week.week) return `Week ${week.week} of ${teachingWeeks(week.term, weeks)}`;
  return KIND_LABEL[week.kind] || week.label;
}

export function dayInfo(now: Date, weeks = WEEKS, holidays = HOLIDAYS): DayInfo {
  const day = localDay(now);
  const week = weekOf(day, weeks);
  const holiday = holidayOn(day, holidays);
  const weekday = localWeekday(now);
  // NewUU teaches on Saturdays: only Sunday is a day off.
  const weekend = weekday === 0;
  const studyDay = !!week && !weekend && !holiday && ["teaching", "midterm", "final", "resit_exam", "induction"].includes(week.kind);
  return { day, week, label: weekLabel(week, weeks), holiday, weekend, studyDay };
}

export type Phase = { kind: WeekKind; title: string; starts: string; ends: string; inDays: number };

/** The next calendar milestone of the given kinds that has not ended yet. */
export function nextPhase(now: Date, kinds: WeekKind[], weeks = WEEKS): Phase | null {
  const day = localDay(now);
  const hit = weeks.find((w) => kinds.includes(w.kind) && w.ends >= day);
  if (!hit) return null;
  // Consecutive weeks of the same kind form one phase (e.g. a two-week break).
  let ends = hit.ends;
  for (const w of weeks.filter((x) => x.order > hit.order)) {
    if (w.kind !== hit.kind || w.starts > addDays(ends, 3)) break;
    ends = w.ends;
  }
  return { kind: hit.kind, title: KIND_LABEL[hit.kind] || hit.label, starts: hit.starts, ends, inDays: Math.max(0, daysBetween(day, hit.starts)) };
}

/** Teaching weeks before the end of a term when its courses can be rated (the last 3: weeks 14–16 of 16). */
export const RATE_WEEKS = 3;

/**
 * Whether the running semester's courses can be rated yet: from the last
 * RATE_WEEKS teaching weeks of the term onward (exam weeks, breaks and grading
 * weeks after them included). Before that, `opensIn` is the teaching week it
 * opens in ("Opens in week 14"). Outside the calendar it is always open.
 */
export function ratingWindow(now: Date, weeks = WEEKS): { open: boolean; opensIn: number | null } {
  const current = weekOf(localDay(now), weeks);
  if (!current) return { open: true, opensIn: null };
  const total = teachingWeeks(current.term, weeks);
  if (!total) return { open: true, opensIn: null };
  const opensIn = Math.max(1, total - RATE_WEEKS + 1);
  const first = weeks.find((w) => w.term === current.term && w.week === opensIn);
  if (!first) return { open: true, opensIn: null };
  return current.order >= first.order ? { open: true, opensIn: null } : { open: false, opensIn };
}

/** The next holiday from today, inclusive. */
export const nextHoliday = (now: Date, holidays = HOLIDAYS) => holidays.find((h) => h.date >= localDay(now)) ?? null;

/** "Fall 2025" → "fall-2025": a past semester's URL segment (/progress/term/fall-2025). */
export const termSlug = (term: string) =>
  term
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The semester a date falls in, by month in Tashkent: Aug–Jan Fall, Feb–May Spring, Jun–Jul Summer. */
export function termOfDate(at: Date): string | null {
  if (Number.isNaN(at.getTime())) return null;
  const local = new Date(at.getTime() + 5 * 3_600_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + 1;
  if (m === 1) return `Fall ${y - 1}`;
  if (m >= 8) return `Fall ${y}`;
  return m <= 5 ? `Spring ${y}` : `Summer ${y}`;
}

/** Whether a semester name matches a URL segment ("Fall 2025" ↔ "fall-2025", also "Fall%202025"). */
export function termMatches(term: string, segment: string) {
  let raw = segment;
  try {
    raw = decodeURIComponent(segment);
  } catch {
    // keep the raw segment
  }
  const slug = termSlug(raw);
  return slug !== "" && termSlug(term) === slug;
}
