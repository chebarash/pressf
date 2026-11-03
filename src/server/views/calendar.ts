import { googleSubscribeUrl } from "@/core/ics";
import { SITE_URL } from "@/core/links";
import { HOLIDAYS, nextHoliday, WEEKS, type WeekKind } from "@/core/semester";
import { addDays, clock, localDay, shortDate, weekdayName } from "@/core/time";
import { classesBetween } from "./classes";
import { deadlines, semesterPhases } from "./shared";
import { loadStudent, type SyncState } from "./student";
import type { Viewer } from "./courses";

/** Calendar (Figma 6.1–6.3): classes, exams, deadlines, holidays and registration as layers. */

export type CalendarLayer = "classes" | "exams" | "deadlines" | "holidays" | "registration";
export const LAYERS: Array<{ id: CalendarLayer; label: string }> = [
  { id: "classes", label: "Classes" },
  { id: "exams", label: "Exams" },
  { id: "deadlines", label: "Deadlines" },
  { id: "holidays", label: "Holidays" },
  { id: "registration", label: "Registration" },
];

export type CalendarEvent = {
  key: string;
  layer: CalendarLayer;
  title: string;
  /** "Exam · 10:00 · B-204", "Deadline · Physics 1 · 23:59", "Holiday · No classes". */
  sub: string;
  day: string;
  endDay: string;
  time: string | null;
  href: string | null;
};

export type CalendarView = {
  sync: SyncState | null;
  layers: Array<{ id: CalendarLayer; label: string; on: boolean }>;
  days: Array<{ day: string; label: string; today: boolean; events: CalendarEvent[] }>;
  /** Nothing in the chosen layers (Figma 6.2). */
  empty: { text: string } | null;
  /** "Add to Google Calendar": Google's add-by-URL page for the feed; `personal` when it is the student's own feed. */
  subscribe: { google: string; personal: boolean };
};

/** Guests subscribe to the public academic calendar (/calendar.ics); students get their own feed (server/calendar-feed). */
const publicSubscription = { google: googleSubscribeUrl(`${SITE_URL}/calendar.ics`), personal: false };

const LAYER_LABEL: Record<CalendarLayer, string> = { classes: "Class", exams: "Exam", deadlines: "Deadline", holidays: "Holiday", registration: "Registration" };
const EXAM_KINDS: WeekKind[] = ["midterm", "final", "resit_exam"];
const REG_KINDS: WeekKind[] = ["registration", "resit_registration"];
const PHASE_TITLE: Partial<Record<WeekKind, string>> = { midterm: "Midterm exams", final: "Final exams", resit_exam: "Resit exams", registration: "Course registration", resit_registration: "Resit registration" };

const rangeLabel = (a: string, b: string) =>
  a === b ? `${weekdayName(a).slice(0, 3)} ${shortDate(a)}` : a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))}–${shortDate(b)}` : `${shortDate(a)} – ${shortDate(b)}`;

/** Phases longer than two weeks show as open/close markers, not as a band over every day. */
export const LONG_PHASE_DAYS = 14;
const BAND_PHASES = new Set(["add-drop", "cohort-selection"]);
export const isLongPhase = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1 > LONG_PHASE_DAYS;

/** Consecutive calendar weeks of the same kind, merged ("Final exams 11–15 Jan"). */
function phases(kinds: WeekKind[], from: string, to: string) {
  const out: Array<{ kind: WeekKind; starts: string; ends: string }> = [];
  for (const w of WEEKS.filter((x) => kinds.includes(x.kind))) {
    const last = out.at(-1);
    if (last && last.kind === w.kind && w.starts <= addDays(last.ends, 3)) last.ends = w.ends;
    else out.push({ kind: w.kind, starts: w.starts, ends: w.ends });
  }
  return out.filter((p) => p.ends >= from && p.starts <= to);
}

/**
 * `range` (default: today and the next 150 days) is what Timetable's week asks
 * for: that week's deadlines, exam weeks and holidays, even in a past week.
 * Classes are not events here: the week grid shows them, the month counts them.
 */
export async function calendar(viewer: Viewer, layers?: CalendarLayer[], now = new Date(), range?: { from: string; to: string }): Promise<CalendarView> {
  const on = new Set<CalendarLayer>(layers?.length ? layers : LAYERS.map((l) => l.id));
  const today = localDay(now);
  const from = range?.from ?? today;
  const to = range?.to ?? addDays(today, 150);
  const student = viewer ? await loadStudent(viewer.userId) : null;
  const events: CalendarEvent[] = [];

  if (student) {
    const classes = await classesBetween(student, today, addDays(today, 13), now);
    for (const c of classes) {
      const day = localDay(new Date(c.start));
      if (c.kind !== "exam" || !on.has("exams")) continue;
      events.push({
        key: `class:${c.key}`, layer: "exams", title: `${c.name} ${c.exam?.kind ?? "exam"}`,
        sub: [LAYER_LABEL.exams, c.time, c.room].filter(Boolean).join(" · "), day, endDay: day, time: c.time, href: c.code ? `/c/${c.code}` : null,
      });
    }
    if (on.has("deadlines")) {
      for (const d of deadlines(student.sync.homework)) {
        const day = localDay(d.due);
        if (day < from || day > to || (d.status !== "todo" && d.status !== "in-progress")) continue;
        events.push({ key: `deadline:${d.id}`, layer: "deadlines", title: d.title, sub: `Deadline · ${d.course} · ${clock(d.due)}`, day, endDay: day, time: clock(d.due), href: "/progress/assignments" });
      }
    }
  }
  events.push(...(await academicEvents(on, from, to)));

  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? "").localeCompare(b.time ?? ""))) {
    const key = `${e.day}|${e.endDay}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const days = [...groups.entries()].map(([key, list]) => {
    const [day, end] = key.split("|");
    return { day, label: `${rangeLabel(day, end)}${day === today ? " · today" : ""}`, today: day === today, events: list };
  });

  let empty: CalendarView["empty"] = null;
  if (!days.length) {
    const h = nextHoliday(now);
    const only = on.size === 1 ? [...on][0] : null;
    empty = { text: only === "holidays" && h ? `The next one is ${h.name}, ${shortDate(h.date)}.` : "Nothing coming up in these layers." };
  }
  return { sync: student?.state ?? null, layers: LAYERS.map((l) => ({ ...l, on: on.has(l.id) })), days, empty, subscribe: publicSubscription };
}

/**
 * The academic calendar in the chosen layers for [from, to]: exam weeks,
 * registration phases (the LMS semester calendar and the university's weeks)
 * and holidays. Shared by the Calendar page and the personal calendar feed.
 */
export async function academicEvents(on: Set<CalendarLayer>, from: string, to: string): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  const today = from;
  if (on.has("exams")) {
    for (const p of phases(EXAM_KINDS, from, to)) {
      events.push({ key: `phase:${p.kind}:${p.starts}`, layer: "exams", title: PHASE_TITLE[p.kind] ?? "Exams", sub: "Exam · Your times appear when the LMS publishes them", day: p.starts, endDay: p.ends, time: null, href: null });
    }
  }
  if (on.has("registration")) {
    // The LMS semester calendar: cohort selection, schedule builder, add/drop.
    for (const p of await semesterPhases(today)) {
      if (p.kind === "studies" || p.kind === "other" || p.startDay > to) continue;
      const where = p.semester ? ` · ${p.semester}` : "";
      const key = `lms-phase:${p.semesterId}:${p.kind}:${p.startDay}`;
      const sub = `Registration${where} · ${shortDate(p.startDay)} – ${shortDate(p.endDay)}`;
      // Student deadlines (add/drop, cohort selection) stay bands whatever their length.
      if (BAND_PHASES.has(p.kind) || !isLongPhase(p.startDay, p.endDay)) {
        events.push({ key, layer: "registration", title: p.title, sub: `Registration${where} · Until ${shortDate(p.endDay)}`, day: p.startDay, endDay: p.endDay, time: null, href: "/programs/mine/curriculum" });
        continue;
      }
      // A long administrative window (the schedule builder runs for months) would
      // paint every day: show where it opens and where it closes, nothing between.
      if (p.startDay >= from) events.push({ key: `${key}:opens`, layer: "registration", title: `${p.title} opens`, sub, day: p.startDay, endDay: p.startDay, time: null, href: "/programs/mine/curriculum" });
      if (p.endDay <= to) events.push({ key: `${key}:closes`, layer: "registration", title: `${p.title} closes`, sub, day: p.endDay, endDay: p.endDay, time: null, href: "/programs/mine/curriculum" });
    }
    for (const p of phases(REG_KINDS, from, to)) {
      events.push({ key: `phase:${p.kind}:${p.starts}`, layer: "registration", title: PHASE_TITLE[p.kind] ?? "Registration", sub: `Registration · Until ${shortDate(p.ends)}`, day: p.starts, endDay: p.ends, time: null, href: "/programs/mine/curriculum" });
    }
  }
  if (on.has("holidays")) {
    for (const h of HOLIDAYS.filter((x) => x.date >= from && x.date <= to)) {
      events.push({ key: `holiday:${h.date}`, layer: "holidays", title: h.name, sub: "Holiday · No classes", day: h.date, endDay: h.date, time: null, href: null });
    }
  }
  return events;
}
