import type { ClassKind } from "@/core/agenda";
import { attendance, attendanceEvents, newAbsences } from "@/core/attendance";
import { remindersDue, type Deadline } from "@/core/deadlines";
import { changedGrades } from "@/core/grades";
import { path } from "@/core/links";
import { fromLms, type AlertSettings, type FeedItem, type LmsNotification } from "@/core/notifications";
import { addDays, clock, localDay, shortDate, weekdayName } from "@/core/time";
import type { LmsGradebookData, LmsGradebookSemester, LmsNotificationsPayload, LmsScheduleDay } from "@/lib/lms/types";
import * as msg from "@/lib/telegram/messages";
import { termName, type SyncedClass, type SyncedCourse, type SyncedSemester } from "./types";

/**
 * Pure conversions from LMS payloads to the sync snapshot, and from two
 * snapshots to alerts: a feed item (in-app) plus the bot message for it.
 */

export type Alert = { item: FeedItem; message: msg.BotMessage; setting: keyof AlertSettings };

/** Gradebook numbers arrive as numbers, strings or `{ mark }`. */
export function num(v: unknown): number | null {
  if (v && typeof v === "object" && "mark" in v) return num((v as { mark: unknown }).mark);
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const semesterRows = (rows: LmsGradebookSemester[]): SyncedSemester[] =>
  rows.map((s) => ({
    id: String(s.semester_id), term: termName(s.semester_name) || `Semester ${s.semester_id}`, year: s.year_of_study ?? null,
    open: s.is_open === 1 || String(s.is_open) === "1", starts: s.study_start ?? null, ends: s.study_end ?? null,
  }));

type GradeRow = NonNullable<LmsGradebookData["resultSubjects"]>[string] & Record<string, unknown>;

export function gradebookCourses(data: LmsGradebookData | null | undefined, semesterId: string): SyncedCourse[] {
  return Object.entries(data?.resultSubjects ?? {}).map(([subjectId, raw]) => {
    const row = raw as GradeRow;
    const final = num(row.final_grade);
    return {
      subjectId, semesterId, name: row.subject?.name?.trim() || "Course",
      average: num(row.average), rating: num(row.rating), final,
      passed: final === null ? null : row.final_grade?.positive_status ?? null, fx: !!row.fx,
      admit: row.admit ?? null,
      events: (row.events ?? []).map((e) => ({ lesson_name: e.lesson_name, lesson_type: e.lesson_type, status: e.status, qr_auto_set_status: e.qr_auto_set_status, time: e.time, mark: (e as { mark?: number | string | null }).mark ?? null })),
    };
  });
}

/** Gradebook keys → mark, for "New grade" detection. */
export function marksOf(courses: SyncedCourse[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const c of courses) {
    out[`${c.subjectId}:final`] = c.final;
    for (const e of c.events) {
      const m = num(e.mark);
      if (m !== null) out[`${c.subjectId}:ev:${e.time ?? ""}:${e.lesson_name ?? ""}`] = m;
    }
  }
  return out;
}

type ScheduleEvent = NonNullable<LmsScheduleDay["events"]>[number] & {
  lesson_id?: string | number;
  subjectType?: { name?: string; short_name?: string } | null;
  lesson_type?: { name?: string } | string | null;
};

const kindFromType = (name: string | null | undefined): ClassKind => {
  const t = (name ?? "").toLowerCase();
  if (/exam|midterm|final|control/.test(t)) return "exam";
  if (t.startsWith("lect")) return "lecture";
  if (t.startsWith("lab")) return "lab";
  if (/prac|tut|sem/.test(t)) return "practice";
  return "other";
};

const roomOf = (a: ScheduleEvent["auditorium"]) => (typeof a === "string" ? a : a?.name) || null;

/** Dated classes from `/schedule/list`, with `was` set where the LMS moved a class. */
export function scheduleClasses(days: LmsScheduleDay[], previous: SyncedClass[]): SyncedClass[] {
  const before = new Map(previous.map((c) => [`${c.subjectId}|${c.lessonId ?? c.start}`, c]));
  const out: SyncedClass[] = [];
  const seen = new Set<string>();
  for (const e of days.flatMap((d) => (d.events ?? []) as ScheduleEvent[])) {
    const startN = Number(e.begin_time);
    if (!e.subject_id || !Number.isFinite(startN) || startN <= 0) continue;
    const start = new Date(startN * 1000);
    const end = new Date((Number(e.end_time) || startN + 80 * 60) * 1000);
    const lessonId = e.lesson_id !== undefined && e.lesson_id !== null ? String(e.lesson_id) : null;
    const key = `${e.subject_id}|${start.toISOString()}|${lessonId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const room = roomOf(e.auditorium);
    const prior = before.get(`${e.subject_id}|${lessonId ?? start.toISOString()}`);
    const moved = prior && prior.start === start.toISOString() && (prior.room ?? "") !== (room ?? "") ? prior.room : prior && prior.start !== start.toISOString() ? clock(new Date(prior.start)) : null;
    const type = typeof e.lesson_type === "string" ? e.lesson_type : e.lesson_type?.name;
    out.push({
      subjectId: String(e.subject_id), start: start.toISOString(), end: end.toISOString(), room, teacherId: e.employee_id ?? null, lessonId,
      kind: kindFromType(e.subjectType?.name ?? type), was: moved ?? prior?.was ?? null,
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Every LMS notification once, from whichever tabs the payload has. */
export function lmsNotifications(payload: LmsNotificationsPayload | null | undefined): LmsNotification[] {
  if (!payload) return [];
  const all = [...(payload.all ?? []), ...(payload.notification ?? []), ...(payload.advertise ?? []), ...(payload.advertise_required ?? []), ...(payload.offer ?? [])];
  const by = new Map<string, LmsNotification>();
  for (const n of all) if (n && n.id !== undefined && n.id !== null && !by.has(String(n.id))) by.set(String(n.id), n);
  return [...by.values()];
}

export function announcementAlerts(list: LmsNotification[]): Alert[] {
  return list.map((n) => {
    const item = { ...fromLms(n), href: path({ to: "notifications", id: `lms:${n.id}` }) };
    return { item, setting: "announcement" as const, message: msg.announcement({ id: item.id, title: item.title, course: "", teacher: n.author ?? null, needsAck: !!item.needsAck }) };
  });
}

type Named = (subjectId: string) => { name: string; code: string };

export function gradeAlerts(prev: Record<string, number | null>, courses: SyncedCourse[], at: Date, named: Named): Alert[] {
  const changes = changedGrades(prev, marksOf(courses));
  return changes.map(({ key, mark }) => {
    const [subjectId, part, time, ...lesson] = key.split(":");
    const c = courses.find((x) => x.subjectId === subjectId);
    const { name } = named(subjectId);
    const what = part === "final" ? "final grade" : lesson.join(":").trim().toLowerCase() || null;
    const average = c?.average ?? null;
    const when = part === "ev" && Number(time) ? new Date(Number(time) * 1000) : at;
    return {
      setting: "grade" as const,
      item: { id: `grade:${key}:${mark}`, kind: "grade" as const, title: `New grade: ${mark}${what ? ` for the ${what}` : ""}`, body: `${name} · ${shortDate(when)}`, courseId: subjectId, at, read: false, href: path({ to: "progress", courseId: subjectId }) },
      message: msg.newGrade({ grade: mark, course: name, courseId: subjectId, item: what ?? "", average }),
    };
  });
}

export function absenceAlerts(prev: SyncedCourse[], next: SyncedCourse[], at: Date, named: Named): Alert[] {
  const out: Alert[] = [];
  for (const c of next) {
    const before = prev.find((p) => p.subjectId === c.subjectId);
    if (!before) continue; // first look at this course: remember, do not alert
    const { name } = named(c.subjectId);
    const a = attendance(c.admit);
    for (const e of newAbsences(attendanceEvents(before.events), attendanceEvents(c.events))) {
      const date = e.at ? `${weekdayName(e.at).slice(0, 3)} ${shortDate(e.at)}` : null;
      out.push({
        setting: "absence",
        item: { id: `absence:${c.subjectId}:${e.lesson}@${e.at?.getTime() ?? ""}`, kind: "absence", title: `Marked absent${a ? ` · ${a.left} left` : ""}`, body: [name, e.lesson, date].filter(Boolean).join(" · "), courseId: c.subjectId, at, read: false, href: path({ to: "progress", courseId: c.subjectId }) },
        message: msg.markedAbsent({ course: name, courseId: c.subjectId, lesson: e.lesson, left: a?.left ?? null }),
      });
    }
    const was = attendance(before.admit);
    if (a && was && a.left === 2 && was.left > 2) {
      out.push({
        setting: "absence",
        item: { id: `absence-limit:${c.subjectId}:2`, kind: "absence", title: "Careful: 2 absences left", body: `${name} · ${a.missed} of ${a.limit} used`, courseId: c.subjectId, at, read: false, href: path({ to: "progress", courseId: c.subjectId }) },
        message: msg.absencesLeft({ course: name, courseId: c.subjectId, used: a.missed, limit: a.limit, left: a.left }),
      });
    }
  }
  return out;
}

/** Upcoming classes (next 2 days) whose room or time changed since the last sync. */
export function roomAlerts(classes: SyncedClass[], prev: SyncedClass[], now: Date, named: Named): Alert[] {
  const today = localDay(now);
  const was = new Map(prev.map((c) => [`${c.subjectId}|${c.lessonId ?? c.start}`, c]));
  return classes
    .filter((c) => c.was && new Date(c.start) > now && localDay(new Date(c.start)) <= addDays(today, 1))
    .filter((c) => {
      const p = was.get(`${c.subjectId}|${c.lessonId ?? c.start}`);
      return !p || p.room !== c.room || p.start !== c.start; // only the run that sees the move
    })
    .map((c) => {
      const start = new Date(c.start);
      const day = localDay(start);
      const when = day === today ? "today" : "tomorrow";
      const { name } = named(c.subjectId);
      const room = c.room ?? "another room";
      return {
        setting: "system" as const,
        item: { id: `room:${c.subjectId}:${c.start}:${c.room ?? ""}`, kind: "system" as const, title: `Room changed to ${room}`, body: `${name} · ${weekdayName(start)} ${clock(start)}`, courseId: c.subjectId, at: now, read: false, href: path({ to: "timetable", day }) },
        message: msg.roomChange({ course: name, room, time: clock(start), when }),
      };
    });
}

export function deadlineAlerts(list: Deadline[], now: Date, lastRun: Date): Alert[] {
  return list
    .filter((d) => d.status === "todo" || d.status === "in-progress")
    .flatMap((d) =>
      remindersDue(d, now, lastRun).map((h) => ({
        setting: "deadline" as const,
        item: { id: `deadline:${d.id}:${h}`, kind: "deadline" as const, title: `${d.title} is due ${h >= 24 ? `in ${Math.round(h / 24)} days` : `in ${h} hours`}`, body: `${d.course} · ${weekdayName(d.due)} ${clock(d.due)}`, at: now, read: false, href: path({ to: "progress" }) },
        message: msg.deadline({ title: d.title, course: d.course, due: clock(d.due), hoursLeft: h, submitted: d.status === "todo" ? false : undefined, target: { to: "progress" } }),
      })),
    );
}

export function fileAlert(course: { id: string; code: string; name: string }, files: Array<{ id: string; title: string; week: number | null }>, now: Date): Alert {
  const week = files.every((f) => f.week === files[0].week) ? files[0].week : null;
  return {
    setting: "file",
    item: { id: `files:${course.id}:${files.map((f) => f.id).sort().join(",")}`.slice(0, 200), kind: "file", title: `${files.length} new ${files.length === 1 ? "file" : "files"}: ${files.map((f) => f.title).join(", ")}`, body: [course.name, week ? `Week ${week}` : null].filter(Boolean).join(" · "), courseId: course.id, at: now, read: false, href: path({ to: "course", code: course.code }) },
    message: msg.newFiles({ course: course.name, courseCode: course.code, week, files: files.map((f) => f.title) }),
  };
}
