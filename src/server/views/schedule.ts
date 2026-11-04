import { dayInfo } from "@/core/semester";
import { addDays, clock, dayStart, localDay, localMinutes, localWeekday, shortDate } from "@/core/time";
import { calendarFeed, feedLayersOf, personalSubscription } from "@/server/calendar-feed";
import { examWeekNote, examWindowList } from "@/server/exams";
import { academicEvents, calendar, LAYERS, type CalendarEvent, type CalendarLayer, type CalendarView } from "./calendar";
import { classesBetween, type ClassView } from "./classes";
import { lessonInfos, type LessonInfo } from "./lessons";
import { DAY_ABBR, deadlines } from "./shared";
import { loadStudent, type Student, type SyncState } from "./student";
import { dayOff } from "./timetable";

/**
 * Timetable, one section with two views of the same data (Calendar was merged
 * into it). The unit is a week, Monday to Sunday: its classes (each with the
 * facts of that dated lesson) and every calendar event touching it (deadlines,
 * exam weeks, holidays, registration). Week and Month (Day and Month on the
 * phone) are two renderers of the same weeks, loaded as they scroll into view
 * (`scheduleWeeks`, served by /api/timetable). The site always shows
 * everything; only the Google Calendar feed has settings.
 */

export type TimetableMode = "week" | "month";

export type ScheduleClass = ClassView & {
  /** The class's day, YYYY-MM-DD (Tashkent). */
  day: string;
  /** Minutes from midnight (Tashkent). */
  from: number;
  to: number;
  /** The course colour: the same course has the same one in every week and both views. */
  tone: number;
  /** That dated lesson: topic, attendance, files, homework, grade. */
  lesson: LessonInfo;
};

export type ScheduleDay = {
  day: string;
  /** "Mon". */
  weekday: string;
  /** "2 Nov". */
  date: string;
  /** Why there are no regular classes ("Holiday · Constitution Day", "Weekend"); null on ordinary days. */
  off: string | null;
  classes: ScheduleClass[];
};

export type ScheduleWeek = {
  /** The Monday, YYYY-MM-DD: the week's key. */
  monday: string;
  /** "Week 8, midterm exams" from the academic calendar. */
  label: string | null;
  /** "No regular classes during midterm week" while an exam window hides classes. */
  note: string | null;
  /** Monday to Sunday. */
  days: ScheduleDay[];
  /** Every calendar event touching the week, multi-day ones whole (the same event can come with the next week too: one key). */
  events: CalendarEvent[];
};

export type SchedulePage = {
  view: TimetableMode;
  /** The selected day, YYYY-MM-DD. */
  day: string;
  today: string;
  /** The weeks around `day` the page opens with; the rest load as they scroll in. */
  weeks: ScheduleWeek[];
  /** From today on, soonest first: "Coming up". */
  coming: CalendarEvent[];
  /** "Add to Google Calendar": the student's own feed, or the public academic calendar for guests. */
  subscribe: CalendarView["subscribe"];
  /** "In Google Calendar": what the student's feed carries; null for guests. */
  feed: { layers: Array<{ id: CalendarLayer; label: string; on: boolean }> } | null;
  signedIn: boolean;
  sync: SyncState | null;
};

const COMING = 6;
/** Weeks the page opens with: two each side of the selected one. */
const AROUND = 2;
/** At most this many weeks per load. */
export const MAX_WEEKS = 8;
const ALL: CalendarLayer[] = LAYERS.map((l) => l.id);

export const isDay = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const mondayOf = (day: string) => addDays(day, -((localWeekday(dayStart(day)) + 6) % 7));

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

/** The student's courses in a fixed order, so a course keeps its colour in every week loaded. */
function toneOf(student: Student | null) {
  const codes = [...new Set([...(student?.cache?.enrollment?.codes ?? []), ...(student?.cache?.timetable ?? []).map((l) => l.code)].filter(Boolean))].sort();
  return (c: Pick<ClassView, "code" | "name">) => {
    const key = c.code || c.name;
    const i = codes.indexOf(key);
    if (i >= 0) return i;
    let h = 0;
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return codes.length + (h % 8);
  };
}

/** Deadlines and the academic calendar in [from, to]: the same events for every view. */
async function eventsBetween(student: Student | null, from: string, to: string): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  for (const d of student ? deadlines(student.sync.homework) : []) {
    const day = localDay(d.due);
    if (day < from || day > to || (d.status !== "todo" && d.status !== "in-progress")) continue;
    events.push({ key: `deadline:${d.id}`, layer: "deadlines", title: d.title, sub: `Deadline · ${d.course} · ${clock(d.due)}`, day, endDay: day, time: clock(d.due), href: "/progress/assignments" });
  }
  events.push(...(await academicEvents(new Set(ALL), from, to)));
  return events.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? "").localeCompare(b.time ?? ""));
}

/** `count` weeks from the Monday of `from`: classes with their lesson facts, and the calendar over them. */
export async function scheduleWeeks(userId: string | null, from: string, count: number, now = new Date(), loaded?: Student | null): Promise<ScheduleWeek[]> {
  const first = mondayOf(isDay(from) ? from : localDay(now));
  const n = Math.max(1, Math.min(MAX_WEEKS, Math.floor(count) || 1));
  const last = addDays(first, n * 7 - 1);
  const student = loaded !== undefined ? loaded : userId ? await loadStudent(userId, { refresh: false }) : null;
  const [classes, events, windows] = await Promise.all([
    student ? classesBetween(student, first, last, now) : Promise.resolve([] as ClassView[]),
    eventsBetween(student, first, last),
    examWindowList().catch(() => []),
  ]);
  const infos = student ? await lessonInfos(student, classes, now) : new Map<string, LessonInfo>();
  const tone = toneOf(student);
  const byDay = new Map<string, ScheduleClass[]>();
  for (const c of classes) {
    const start = new Date(c.start);
    const day = localDay(start);
    const info = infos.get(c.key);
    if (!info) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), { ...c, day, from: localMinutes(start), to: localMinutes(new Date(c.end)), tone: tone(c), lesson: info }]);
  }
  return Array.from({ length: n }, (_, w) => {
    const monday = addDays(first, w * 7);
    const sunday = addDays(monday, 6);
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(monday, i);
      return { day, weekday: DAY_ABBR[localWeekday(dayStart(day))], date: shortDate(day), off: dayOff(day), classes: byDay.get(day) ?? [] };
    });
    return {
      monday,
      label: dayInfo(dayStart(monday)).label,
      note: examWeekNote(windows, monday) ?? examWeekNote(windows, addDays(monday, 2)),
      days,
      events: events.filter((e) => e.day <= sunday && e.endDay >= monday),
    };
  });
}

/** The Mondays a view opens with: the selected week and two each side (the month's weeks with one each side). */
export function openingWeeks(view: TimetableMode, day: string): { from: string; count: number } {
  if (view === "week") return { from: addDays(mondayOf(day), -7 * AROUND), count: AROUND * 2 + 1 };
  const first = `${day.slice(0, 7)}-01`;
  const from = addDays(mondayOf(first), -7);
  const end = addDays(`${day.slice(0, 7)}-28`, 7);
  return { from, count: Math.min(MAX_WEEKS, Math.ceil((Date.parse(end) - Date.parse(from)) / (7 * 86_400_000)) + 1) };
}

/** The Timetable page: the opening weeks, "Coming up" and the Google Calendar feed. Null for a guest asking for the week. */
export async function schedule(userId: string | null, opts: { view: TimetableMode; day?: string | null }, now = new Date()): Promise<SchedulePage | null> {
  const today = localDay(now);
  const day = isDay(opts.day) ? opts.day : today;
  if (opts.view === "week" && !userId) return null;
  const student = userId ? await loadStudent(userId) : null;
  if (userId && !student) return null;
  const open = openingWeeks(opts.view, day);
  const [weeks, cal, feed] = await Promise.all([
    scheduleWeeks(userId, open.from, open.count, now, student),
    calendar(userId ? { userId } : null, ALL, now),
    // Without a feed (no signing key on this server) the page still opens, with the public calendar to add.
    userId ? calendarFeed(userId).catch(() => null) : Promise.resolve(null),
  ]);
  const on = feed ? feedLayersOf(feed.layers) : [];
  return {
    view: opts.view,
    day,
    today,
    weeks,
    coming: comingUp(cal.days.flatMap((d) => d.events), today),
    subscribe: feed ? personalSubscription(feed.token) : cal.subscribe,
    feed: feed ? { layers: LAYERS.map((l) => ({ ...l, on: on.includes(l.id) })) } : null,
    signedIn: !!student,
    sync: student?.state ?? null,
  };
}
