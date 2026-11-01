import calendar from "../../data/academic-calendar-2026-2027.json";

export type CalendarWeek = (typeof calendar.weeks)[number];
export type Hint = { text: string; action: string; href: string; tone: "Info" | "Warning" };

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400_000);

export const weeks = calendar.weeks;

/** Weekends belong to the week that just ended. */
export function currentWeek(now = new Date()): CalendarWeek | null {
  const today = iso(now);
  return (
    weeks.find((week) => week.starts <= today && today <= week.ends) ??
    [...weeks].reverse().find((week) => week.ends < today && today <= iso(addDays(new Date(week.ends), 2))) ??
    null
  );
}

export const upcoming = (kind: string, within: number, now = new Date()) => {
  const today = iso(now);
  const limit = iso(addDays(now, within));
  return weeks.find((week) => week.kind === kind && week.starts >= today && week.starts <= limit) ?? null;
};

const label = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** One hint at a time: exams come before registration. */
export function calendarHint(now = new Date()): Hint | null {
  const week = currentWeek(now);
  const midterm = upcoming("midterm", 7, now);
  const final = upcoming("final", 7, now);
  const resit = upcoming("resit_registration", 7, now);
  const register = upcoming("registration", 14, now);
  const files = { action: "Open files", href: "/files" };
  if (week?.kind === "midterm" || week?.kind === "final") {
    return { tone: "Warning", text: `${week.kind === "midterm" ? "Midterm" : "Final"} exams are on this week. Past papers are ready.`, ...files };
  }
  if (midterm) return { tone: "Warning", text: `Midterm week starts ${label(midterm.starts)}. Past exams and mocks are ready.`, ...files };
  if (final) return { tone: "Warning", text: `Final exams start ${label(final.starts)}. Past exams are ready.`, ...files };
  if (resit) return { tone: "Info", text: `Resit registration opens ${label(resit.starts)}.`, action: "See calendar", href: "/calendar" };
  if (week?.kind === "registration") return { tone: "Info", text: "Course registration is open.", action: "See next semester", href: "/next-semester" };
  if (register) return { tone: "Info", text: `Course registration opens ${label(register.starts)}.`, action: "See next semester", href: "/next-semester" };
  if (week?.term === "fall" && (week.week ?? 0) >= 13) return { tone: "Info", text: "See what next semester looks like.", action: "Explore", href: "/next-semester" };
  return null;
}

export const milestones = weeks.filter((week) =>
  ["registration", "induction", "midterm", "final", "break", "resit_registration", "resit_exam"].includes(week.kind)
);

export const isExamWeek = (week: CalendarWeek | null) => week?.kind === "midterm" || week?.kind === "final";

export type Term = "fall" | "spring" | "summer";
export const TERMS: Term[] = ["fall", "spring", "summer"];

/** The university runs on Tashkent time, whatever the server clock says. */
export const tashkentNow = (now = new Date()) => new Date(now.getTime() + 5 * 3600_000);

const HOLIDAY_NAMES: Record<string, string> = {
  "2026-09-01": "Independence Day",
  "2026-10-01": "Teachers' Day",
  "2026-12-08": "Constitution Day",
  "2027-03-08": "International Women's Day",
};

export const holidays = calendar.holidays.map((holiday) => ({ date: holiday.date, name: HOLIDAY_NAMES[holiday.date] ?? "Holiday" }));

const NAMES: Record<string, string> = {
  registration: "Course registration",
  induction: "Induction",
  midterm: "Midterm exams",
  final: "Final exams",
  break: "Break",
  resit_registration: "Resit preparation and registration",
  resit_exam: "Resit exams",
};

/** What a week is called, in words the source PDF only hints at. */
export function weekTitle(week: CalendarWeek) {
  const note = week.note ?? "";
  if (week.term === "summer") {
    if (/midterm/i.test(note)) return "Summer midterm exam";
    if (/final/i.test(note)) return "Summer final exam";
    if (/administrative/i.test(note)) return "Summer semester starts";
    if (/grading/i.test(note)) return "Summer grading and reports";
    return "Summer classes";
  }
  if (/revision/i.test(note) && week.kind === "teaching" && /online/i.test(note)) return "Online revision week";
  if (week.kind === "teaching") return `Week ${week.week}`;
  if (week.kind === "other") return /resit/i.test(note) ? "Grading of resit exams" : "Grading and paper review";
  return NAMES[week.kind] ?? week.label;
}

export const termWeeks = (term: Term) => weeks.filter((week) => week.term === term);
export const holidaysIn = (week: CalendarWeek) => holidays.filter((holiday) => week.starts <= holiday.date && holiday.date <= week.ends);

/** The term to open: the current one, or the next to come. */
export function activeTerm(now = new Date()): Term {
  const today = iso(now);
  return (currentWeek(now) ?? weeks.find((week) => week.starts >= today) ?? weeks[weeks.length - 1]).term as Term;
}

export function semesterProgress(now = new Date()) {
  const week = currentWeek(now);
  if (!week?.week) return null;
  const total = Math.max(...termWeeks(week.term as Term).map((item) => item.week ?? 0));
  return { term: week.term as Term, week: week.week, total };
}

export function daysUntil(date: string, now = new Date()) {
  return Math.round((new Date(date).getTime() - new Date(iso(now)).getTime()) / 86400_000);
}

export type Countdown = { title: string; starts: string; ends: string; href?: string };

export function countdowns(now = new Date()): Array<{ label: string; event: Countdown | null }> {
  const today = iso(now);
  const next = (kinds: string[]) => weeks.find((week) => kinds.includes(week.kind) && week.ends >= today);
  const event = (week: CalendarWeek | undefined, href?: string) => (week ? { title: weekTitle(week), starts: week.starts, ends: week.ends, href } : null);
  const exam = next(["midterm", "final", "resit_exam"]);
  const breakWeek = next(["break"]);
  const holiday = holidays.find((item) => item.date >= today);
  const dayOff = holiday && (!breakWeek || holiday.date < breakWeek.starts) ? { title: holiday.name, starts: holiday.date, ends: holiday.date } : event(breakWeek);
  const lastBreak = breakWeek && [...weeks].reverse().find((week) => week.kind === "break" && week.term === breakWeek.term);
  const days = dayOff && breakWeek && dayOff.starts === breakWeek.starts ? { ...dayOff, ends: lastBreak!.ends } : dayOff;
  return [
    { label: "Next exams", event: event(exam, exam?.kind === "resit_exam" ? "/files" : `/files?type=${exam?.kind}`) },
    { label: "Next day off", event: days },
    { label: "Next registration", event: event(next(["registration"]), "/next-semester") },
  ];
}

const stamp = (date: string, days = 0) => iso(addDays(new Date(date), days)).replace(/-/g, "");

/** The year as an iCalendar file, for Google, Apple and Outlook calendars. */
export function calendarIcs() {
  const event = (id: string, title: string, starts: string, ends: string) => [
    "BEGIN:VEVENT", `UID:${id}@pressf.chebarash.uz`, `DTSTAMP:${stamp(weeks[0].starts)}T000000Z`,
    `DTSTART;VALUE=DATE:${stamp(starts)}`, `DTEND;VALUE=DATE:${stamp(ends, 1)}`, `SUMMARY:${title.replace(/([,;\\])/g, "\\$1")}`, "END:VEVENT",
  ];
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Press F//Academic calendar//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:NewUU academic calendar",
    ...milestones.flatMap((week) => event(`week-${week.order}`, weekTitle(week), week.starts, week.ends)),
    ...holidays.flatMap((holiday) => event(`holiday-${holiday.date}`, holiday.name, holiday.date, holiday.date)),
    "END:VCALENDAR", "",
  ].join("\r\n");
}
