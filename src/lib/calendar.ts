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
/** `grouped` narrows the exam link to the courses of the student's group. */
export function calendarHint(now = new Date(), grouped = false): Hint | null {
  const week = currentWeek(now);
  const midterm = upcoming("midterm", 7, now);
  const final = upcoming("final", 7, now);
  const resit = upcoming("resit_registration", 7, now);
  const register = upcoming("registration", 14, now);
  const papers = (type: string) => ({ action: "Open files", href: `/files?type=${type}${grouped ? "&mine=1" : ""}` });
  if (week?.kind === "midterm" || week?.kind === "final") {
    return { tone: "Warning", text: `${week.kind === "midterm" ? "Midterm" : "Final"} exams are on this week. Past papers are ready.`, ...papers(week.kind) };
  }
  if (midterm) return { tone: "Warning", text: `Midterm week starts ${label(midterm.starts)}. Past exams and mocks are ready.`, ...papers("midterm") };
  if (final) return { tone: "Warning", text: `Final exams start ${label(final.starts)}. Past exams are ready.`, ...papers("final") };
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
