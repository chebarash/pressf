import { CLASS_KIND_LABEL } from "@/core/agenda";
import type { CalendarEvent, CalendarLayer, ScheduleClass, ScheduleDay, ScheduleWeek, TimetableMode } from "@/server/views";

/**
 * Timetable's one client model, shared by every renderer (desktop Week and
 * Month, phone Day and Month): date arithmetic on a fixed day index, what a
 * range of days holds (the same classes and events whichever view asks), and
 * how a view switch keeps the date. Pure, so it is tested without a browser.
 */

/** Day 0 of the scrollable range: a Monday far enough back for any student. Weeks are counted from it too. */
export const ORIGIN = "2016-01-04";
/** Days in the scrollable range (twenty years): endless for any practical purpose, and a plain number to scroll. */
export const SPAN_DAYS = 20 * 364;
export const SPAN_WEEKS = SPAN_DAYS / 7;

const DAY_MS = 86_400_000;
const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);
export const dayIndex = (day: string) => Math.round((utc(day) - utc(ORIGIN)) / DAY_MS);
export const dayAt = (index: number) => new Date(utc(ORIGIN) + index * DAY_MS).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => dayAt(dayIndex(day) + n);
export const weekIndex = (day: string) => Math.floor(dayIndex(day) / 7);
export const mondayAt = (week: number) => dayAt(week * 7);
export const mondayOf = (day: string) => mondayAt(weekIndex(day));
export const clampIndex = (i: number, max: number) => Math.max(0, Math.min(max, i));

export const monthKey = (day: string) => day.slice(0, 7);
export const monthLabel = (day: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthKey(day)}-15T12:00:00Z`));
/** The month a week "belongs" to: its Thursday's (ISO weeks do the same). */
export const monthOfWeek = (monday: string) => monthKey(addDays(monday, 3));
export const firstOfMonth = (month: string) => `${month}-01`;
export const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
/** "Mon 2 Nov". */
export const dayTitle = (day: ScheduleDay) => `${day.weekday} ${day.date}`;

/**
 * Switching Week ⇄ Month (Day ⇄ Month on the phone) changes only the renderer:
 * the selected day and class stay, so the month opens on that day's month with
 * the day highlighted and the week opens on that day's week.
 */
export function switchView<S extends { view: TimetableMode; day: string; open: string | null }>(state: S, view: TimetableMode): S {
  return { ...state, view };
}

/** The Mondays a run of days needs. */
export const mondaysBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let w = weekIndex(from); w <= weekIndex(to); w++) out.push(mondayAt(w));
  return out;
};

/** Loaded weeks, by Monday. */
export type Weeks = ReadonlyMap<string, ScheduleWeek>;

export const dayOf = (weeks: Weeks, day: string): ScheduleDay | null => weeks.get(mondayOf(day))?.days.find((d) => d.day === day) ?? null;

export function classByKey(weeks: Weeks, key: string | null): ScheduleClass | null {
  if (!key) return null;
  const at = key.split("@")[1];
  const guess = at ? weeks.get(mondayOf(localDayOf(at))) : undefined;
  for (const w of guess ? [guess, ...weeks.values()] : weeks.values()) for (const d of w.days) for (const c of d.classes) if (c.key === key) return c;
  return null;
}

/** Tashkent day of an ISO time (UTC+5, no DST). */
export const localDayOf = (iso: string) => new Date(Date.parse(iso) + 5 * 3600_000).toISOString().slice(0, 10);

/**
 * What [from, to] holds, whichever view shows it: every class of those days and
 * every event touching them, each once (a multi-day event comes with each week
 * it touches). `loaded` is false while a week of the range is still loading.
 */
export function between(weeks: Weeks, from: string, to: string): { classes: ScheduleClass[]; events: CalendarEvent[]; loaded: boolean } {
  const classes: ScheduleClass[] = [];
  const events = new Map<string, CalendarEvent>();
  let loaded = true;
  for (const monday of mondaysBetween(from, to)) {
    const w = weeks.get(monday);
    if (!w) {
      loaded = false;
      continue;
    }
    for (const d of w.days) if (d.day >= from && d.day <= to) classes.push(...d.classes);
    for (const e of w.events) if (e.day <= to && e.endDay >= from && !events.has(e.key)) events.set(e.key, e);
  }
  return { classes, events: [...events.values()].sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? "").localeCompare(b.time ?? "")), loaded };
}

export type Lane = { key: string; title: string; layer: CalendarLayer; href: string | null; from: number; to: number; lane: number; event: CalendarEvent };

/** Multi-day and all-day events over a run of days as bars: column `from` to `to`, stacked in lanes. */
export function lanesOf(events: CalendarEvent[], days: string[]): Lane[] {
  const used: number[][] = [];
  const out: Lane[] = [];
  if (!days.length) return out;
  const last = days.length - 1;
  for (const e of [...events].sort((a, b) => a.day.localeCompare(b.day) || b.endDay.localeCompare(a.endDay))) {
    if (e.day > days[last] || e.endDay < days[0]) continue;
    const from = e.day <= days[0] ? 0 : days.indexOf(e.day);
    const to = e.endDay >= days[last] ? last : days.indexOf(e.endDay);
    if (from < 0 || to < 0) continue;
    let lane = used.findIndex((cols) => cols.every((c) => c < from || c > to));
    if (lane < 0) lane = used.push([]) - 1;
    for (let c = from; c <= to; c++) used[lane].push(c);
    out.push({ key: e.key, title: e.layer === "deadlines" && e.time ? `${e.title} · ${e.time}` : e.title, layer: e.layer, href: e.href, from, to, lane, event: e });
  }
  return out;
}

export const minutesOf = (time: string | null) => (time && /^\d\d:\d\d$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) : null);

/**
 * The week grid's placement of [days]: classes as cards, deadlines inside the
 * hours as lines at their time, a holiday as its day's reason, everything
 * else as bars under the day heads. Every class and event of the range is
 * placed exactly once (what the month shows too).
 */
export function weekLayout(weeks: Weeks, days: string[], hours: { start: number; end: number }) {
  const { classes, events } = between(weeks, days[0], days.at(-1)!);
  const markers: Array<{ key: string; title: string; day: number; minutes: number; event: CalendarEvent }> = [];
  const offs: Array<{ key: string; day: number; title: string; event: CalendarEvent }> = [];
  const rest: CalendarEvent[] = [];
  for (const e of events) {
    const minutes = minutesOf(e.time);
    const col = days.indexOf(e.day);
    if (e.layer === "deadlines" && minutes !== null && col >= 0 && minutes >= hours.start * 60 && minutes < hours.end * 60) markers.push({ key: e.key, title: `${e.title} · ${e.time}`, day: col, minutes, event: e });
    else if (e.layer === "holidays" && e.day === e.endDay && col >= 0) offs.push({ key: e.key, day: col, title: e.title, event: e });
    else rest.push(e);
  }
  return { classes, markers, offs, lanes: lanesOf(rest, days) };
}

/** The month grid's placement of [days] (whole weeks): bars for multi-day events, the rest in their day, classes in their day. */
export function monthLayout(weeks: Weeks, days: string[]) {
  const { classes, events } = between(weeks, days[0], days.at(-1)!);
  const multi = events.filter((e) => e.endDay > e.day);
  const single = events.filter((e) => e.endDay <= e.day);
  return { classes, lanes: lanesOf(multi, days), single };
}

/** The hours the week grid shows: 09–20, stretched to fit any class loaded. */
export function hoursFor(weeks: Weeks) {
  let start = 9;
  let end = 20;
  for (const w of weeks.values()) for (const d of w.days) for (const c of d.classes) {
    start = Math.min(start, Math.floor(c.from / 60));
    end = Math.max(end, Math.ceil(c.to / 60));
  }
  return { start, end };
}

/** "Week 8, midterm exams · 2 Nov – 7 Nov". */
export function weekTitle(weeks: Weeks, day: string) {
  const w = weeks.get(mondayOf(day));
  if (!w) return "";
  const sat = w.days[5];
  return [w.label, `${w.days[0].date} – ${sat.date}`, w.note].filter(Boolean).join(" · ");
}

export const COURSE_TONES = ["teal", "plum", "moss", "mustard", "sky", "rose", "sand", "rust"] as const;
export type Tone = (typeof COURSE_TONES)[number];
export const toneName = (c: Pick<ScheduleClass, "tone">): Tone => COURSE_TONES[c.tone % COURSE_TONES.length];

const KIND_LABEL: Record<string, string> = { ...CLASS_KIND_LABEL, lab: "Lab", other: "" };
/** "10:00 · B-204 · Lecture", the card's second line in both views. */
export const classMeta = (c: ScheduleClass) =>
  c.kind === "exam" ? [`${c.time}–${c.endTime}`, c.room].filter(Boolean).join(" · ") : [c.time, c.room, c.changedFrom ? "moved" : KIND_LABEL[c.kind]].filter(Boolean).join(" · ");
export const classTitle = (c: ScheduleClass) => (c.kind === "exam" ? `${c.name} · ${c.exam ? c.exam.kind.toUpperCase() : "EXAM"}` : c.name);
