import { addDays, dayStart, localDay, localWeekday } from "@/core/time";
import { calendarFeed, feedLayersOf, personalSubscription } from "@/server/calendar-feed";
import { calendar, LAYERS, type CalendarEvent, type CalendarLayer, type CalendarView } from "./calendar";
import { classesBetween } from "./classes";
import { loadStudent } from "./student";
import { timetable, type TimetableView } from "./timetable";

/**
 * Timetable, one section with two views (Calendar was merged into it):
 * - week: the class grid with the calendar's deadlines, exam weeks, holidays and
 *   registration laid over it, and "Coming up" beside it;
 * - month: the calendar month with a dot per class on each day.
 * The site always shows everything; only the Google Calendar feed has settings
 * (which layers it carries), shown with its "Add to Google Calendar".
 */

export type TimetableMode = "week" | "month";

export type ScheduleView = {
  view: TimetableMode;
  /** The week's selected day, or the day the month opens at. */
  day: string;
  /** The week (classes, days off, the class sheet's data); null for guests and in the month. */
  week: TimetableView | null;
  /** The calendar, every layer: the month's events, or the week's and what comes after. */
  calendar: CalendarView;
  /** Week: what the calendar adds to that week. Never a class or an exam class (the grid shows them), never a holiday the grid already names. */
  overlays: CalendarEvent[];
  /** From today on, soonest first: the "Coming up" list. */
  coming: CalendarEvent[];
  /** Month: the months shown ("2026-11"), the first one opens unless `day` is in another. */
  months: string[];
  /** Month: each day's classes as course keys (code, or name), for the dots. */
  classDays: Record<string, string[]>;
  /** The student's Google Calendar feed: what it carries ("In Google Calendar"); null for guests (they add the academic calendar). */
  feed: { layers: Array<{ id: CalendarLayer; label: string; on: boolean }> } | null;
};

const COMING = 6;
const MONTHS = 5;
const ALL: CalendarLayer[] = LAYERS.map((l) => l.id);

const mondayOf = (day: string) => addDays(day, -((localWeekday(dayStart(day)) + 6) % 7));
const monthKey = (day: string) => day.slice(0, 7);
const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};
const lastDay = (m: string) => addDays(`${nextMonth(m)}-01`, -1);
const isDay = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The months the month view shows: five from this month, reaching back or ahead to the asked day's month. */
export function monthsShown(today: string, focus: string, count = MONTHS): string[] {
  const first = monthKey(focus < today ? focus : today);
  const out = [first];
  while (out.length < count || out.at(-1)! < monthKey(focus)) out.push(nextMonth(out.at(-1)!));
  return out;
}

/**
 * Week overlays: the calendar's events in that week, without what the grid
 * already shows (classes and exam classes are cards; a holiday is the day's
 * hatched reason). Multi-day events (exam weeks, registration) stay one event.
 */
export function weekOverlays(events: CalendarEvent[], week: Pick<TimetableView, "week">): CalendarEvent[] {
  const days = week.week.map((d) => d.day);
  if (!days.length) return [];
  const [from, to] = [mondayOf(days[0]), addDays(mondayOf(days[0]), 6)];
  const offName = new Map(week.week.map((d) => [d.day, d.off ?? ""]));
  const seen = new Set<string>();
  return events.filter((e) => {
    if (seen.has(e.key)) return false;
    seen.add(e.key);
    if (e.key.startsWith("class:") || e.layer === "classes") return false;
    if (e.day > to || e.endDay < from) return false;
    if (e.layer === "holidays" && offName.get(e.day)?.includes(e.title)) return false;
    return true;
  });
}

/** Upcoming events from today, soonest first; each once. */
export function comingUp(events: CalendarEvent[], today: string, count = COMING): CalendarEvent[] {
  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  for (const e of events) {
    if (e.endDay < today || e.layer === "classes" || seen.has(e.key)) continue;
    seen.add(e.key);
    out.push(e);
  }
  // Calendar events come sorted by start day; one that is already running sorts as today.
  const start = (e: CalendarEvent) => (e.day < today ? today : e.day);
  return out.sort((a, b) => start(a).localeCompare(start(b)) || (a.time ?? "").localeCompare(b.time ?? "")).slice(0, count);
}

export async function schedule(userId: string | null, opts: { view: TimetableMode; day?: string | null; mobile?: boolean }, now = new Date()): Promise<ScheduleView | null> {
  const today = localDay(now);
  const day = isDay(opts.day) ? opts.day : today;
  const viewer = userId ? { userId } : null;
  // The student's own feed (made on first visit) for "Add to Google Calendar" and its settings.
  const feedOf = async () => (userId ? calendarFeed(userId) : null);
  const withFeed = (c: CalendarView, f: Awaited<ReturnType<typeof feedOf>>): CalendarView => (f ? { ...c, subscribe: personalSubscription(f.token) } : c);
  const feedView = (f: Awaited<ReturnType<typeof feedOf>>): ScheduleView["feed"] => {
    if (!f) return null;
    const on = feedLayersOf(f.layers);
    return { layers: LAYERS.map((l) => ({ ...l, on: on.includes(l.id) })) };
  };

  if (opts.view === "week") {
    if (!userId) return null;
    const monday = mondayOf(day);
    const range = { from: monday < today ? monday : today, to: addDays(monday, 6) > addDays(today, 150) ? addDays(monday, 6) : addDays(today, 150) };
    // The phone's day view shows classes only; its month has the rest.
    const [week, cal, feed] = await Promise.all([timetable(userId, day, now), opts.mobile ? null : calendar(viewer, ALL, now, range), opts.mobile ? null : feedOf()]);
    if (!week) return null;
    const events = cal?.days.flatMap((d) => d.events) ?? [];
    const shown = cal ? withFeed(cal, feed) : emptyCalendar();
    return { view: "week", day, week, calendar: shown, overlays: weekOverlays(events, week), coming: comingUp(events, today), months: [], classDays: {}, feed: feedView(feed) };
  }

  const months = monthsShown(today, day);
  const from = `${months[0]}-01`;
  const to = lastDay(months.at(-1)!);
  const student = userId ? await loadStudent(userId) : null;
  const [cal, classes, feed] = await Promise.all([
    calendar(viewer, ALL, now, { from: from < today ? from : today, to: to > addDays(today, 150) ? to : addDays(today, 150) }),
    student ? classesBetween(student, from, to, now) : Promise.resolve([]),
    feedOf(),
  ]);
  const classDays: Record<string, string[]> = {};
  // Exams show as events; regular classes are dots.
  for (const c of classes) if (c.kind !== "exam") (classDays[localDay(new Date(c.start))] ??= []).push(c.code || c.name);
  const events = cal.days.flatMap((d) => d.events);
  return { view: "month", day, week: null, calendar: withFeed(cal, feed), overlays: [], coming: comingUp(events, today), months, classDays, feed: feedView(feed) };
}

function emptyCalendar(): CalendarView {
  return { sync: null, layers: LAYERS.map((l) => ({ ...l, on: true })), days: [], empty: null, subscribe: { google: "", personal: false } };
}
