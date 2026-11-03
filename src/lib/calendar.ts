import calendar from "../../data/academic-calendar-2026-2027.json";

type CalendarWeek = (typeof calendar.weeks)[number];

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400_000);

const weeks = calendar.weeks;

const milestones = weeks.filter((week) =>
  ["registration", "induction", "midterm", "final", "break", "resit_registration", "resit_exam"].includes(week.kind)
);

const HOLIDAY_NAMES: Record<string, string> = {
  "2026-09-01": "Independence Day",
  "2026-10-01": "Teachers' Day",
  "2026-12-08": "Constitution Day",
  "2027-03-08": "International Women's Day",
};

const holidays = calendar.holidays.map((holiday) => ({ date: holiday.date, name: HOLIDAY_NAMES[holiday.date] ?? "Holiday" }));

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
function weekTitle(week: CalendarWeek) {
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
