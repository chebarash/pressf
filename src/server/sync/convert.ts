import type { ClassKind } from "@/core/agenda";
import { kindOfLessonType } from "@/core/agenda";
import { attendance, attendanceEvents, classTime, newAbsences, type LmsAdmit, type LmsAttendanceEvent } from "@/core/attendance";
import { personOf } from "@/core/people";
import { remindersDue, type Deadline } from "@/core/deadlines";
import { changedGrades, passedFinal } from "@/core/grades";
import { lessonLabel } from "@/core/feed-marks";
import { fileList } from "@/core/files";
import { path } from "@/core/links";
import { fromLms, type AlertSettings, type FeedItem, type LmsNotification } from "@/core/notifications";
import { addDays, clock, localDay, shortDate, weekdayName } from "@/core/time";
import { lmsDay } from "@/lib/lms/semesters";
import type { LmsGradebookData, LmsGradebookRow, LmsGradebookSemester, LmsMyList, LmsNotificationsPayload, LmsScheduleDay } from "@/lib/lms/types";
import * as msg from "@/lib/telegram/messages";
import { termName, type SyncedClass, type SyncedCourse, type SyncedEvent, type SyncedSemester } from "./types";

/**
 * Pure conversions from LMS payloads to the sync snapshot, and from two
 * snapshots to alerts: a feed item (in-app) plus the bot message for it.
 */

export type Alert = { item: FeedItem; message: msg.BotMessage; setting: keyof AlertSettings };

/**
 * Gradebook numbers arrive as numbers, strings, `{ mark }` or a list of
 * `{ mark, type, rating_id }` (one per rating period: `average`, `rating`,
 * `rk`, `siw_average`); a list reads as its latest period with a mark.
 */
export function num(v: unknown): number | null {
  if (Array.isArray(v)) {
    for (let i = v.length - 1; i >= 0; i--) {
      const n = num(v[i]);
      if (n !== null) return n;
    }
    return null;
  }
  if (v && typeof v === "object") return "mark" in v ? num((v as { mark: unknown }).mark) : null;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const semesterRows = (rows: LmsGradebookSemester[]): SyncedSemester[] =>
  rows.map((s) => ({
    id: String(s.semester_id), term: termName(s.semester_name) || `Semester ${s.semester_id}`, year: s.year_of_study ?? null,
    open: s.is_open === 1 || String(s.is_open) === "1", starts: lmsDay(s.study_start), ends: lmsDay(s.study_end),
  }));

/**
 * Every semester the student has studied: the gradebook list, plus the past and
 * current semesters of `/subject/my-list`. The gradebook list leaves out the
 * first study year (2023-24 for the class of 2027), although
 * `/gradebook/gradebook-data` still answers for those ids with final grades.
 * Upcoming semesters (`is_open` 2) are not studied yet and stay out. Oldest first.
 */
export function studiedSemesters(gradebook: LmsGradebookSemester[] | null | undefined, list: LmsMyList | null | undefined): SyncedSemester[] {
  const by = new Map(semesterRows(gradebook ?? []).map((s) => [s.id, s]));
  for (const m of list?.semesters ?? []) {
    const id = String(m.semester_id ?? m.id ?? "");
    if (!id || by.has(id) || String(m.is_open) === "2") continue;
    by.set(id, {
      id, term: termName(m.name) || m.name || `Semester ${id}`, year: null,
      open: String(m.is_open) === "1", starts: null, ends: null,
    });
  }
  return [...by.values()].sort((a, b) => termOrder(a.term) - termOrder(b.term) || Number(a.id) - Number(b.id));
}

const termOrder = (term: string) => Number(term.match(/\d{4}/)?.[0] ?? 0) * 10 + ({ Spring: 1, Summer: 2, Fall: 3 }[term.split(" ")[0]] ?? 0);

type GradeRow = LmsGradebookRow & Record<string, unknown>;

/** `subject.employee`: `{ "118": "Kholov Vohid " }` (family name first) on newer semesters, `[]` on older ones. */
function gradebookTeachers(v: unknown): string[] {
  const names = Array.isArray(v) ? v.map((e) => (typeof e === "string" ? e : personOf(e as Record<string, unknown>))) : v && typeof v === "object" ? Object.values(v as Record<string, unknown>) : [];
  return names
    .filter((n): n is string => typeof n === "string" && !!n.trim() && n !== "Teacher")
    .map((n) => {
      const parts = n.trim().split(/\s+/);
      // "Family Given" → "Given Family" (the LMS's own order in this map).
      return Array.isArray(v) || parts.length < 2 ? n.trim() : [...parts.slice(1), parts[0]].join(" ");
    });
}

/** One stored class: the fields the views read, with the class time resolved. */
export function syncedEvent(e: LmsAttendanceEvent & { mark?: unknown }): SyncedEvent {
  const at = classTime(e);
  return {
    ...(e.id !== undefined ? { id: e.id } : {}),
    ...(e.lesson_id !== undefined && e.lesson_id !== null ? { lesson_id: e.lesson_id } : {}),
    lesson_name: e.lesson_name, lesson_number: e.lesson_number ?? null, lesson_type: e.lesson_type, status: e.status, qr_auto_set_status: e.qr_auto_set_status ?? null,
    time: e.time ?? null, at: at ? Math.floor(at.getTime() / 1000) : null,
    mark: (e.mark as number | string | null | undefined) ?? null,
  };
}

const truthy = (v: unknown) => v === true || v === 1 || v === "1";

/**
 * Courses of one semester's gradebook. `open`: the semester is running, so a
 * final of 0 that did not pass is "no final yet" (the LMS fills 0 until then).
 */
export function gradebookCourses(data: LmsGradebookData | null | undefined, semesterId: string, open = false): SyncedCourse[] {
  const rows = data?.resultSubjects;
  if (!rows || typeof rows !== "object" || Array.isArray(rows)) return [];
  return Object.entries(rows).map(([subjectId, raw]) => {
    const row = raw as GradeRow;
    const finalRow = row.final_grade as { mark?: unknown; positive_status?: boolean } | null | undefined;
    let final = num(finalRow);
    const exam = num(row.e);
    if (final === 0 && !finalRow?.positive_status && open && !exam) final = null;
    const admitRow = (row.admit ?? null) as (LmsAdmit & { admit?: unknown }) | null;
    return {
      subjectId, semesterId, name: (row.subject?.name ?? "").trim() || "Course",
      average: num(row.average), rating: num(row.rating), final,
      passed: passedFinal(final, finalRow?.positive_status), fx: !!num(row.fx) || row.fx === true,
      admission: num(row.rd), exam, midterm: num(row.rk), siw: num(row.siw_average),
      admitted: admitRow && admitRow.admit !== null && admitRow.admit !== undefined && (Number(admitRow.lessons_count) > 0 || truthy(admitRow.admit)) ? truthy(admitRow.admit) : null,
      teachers: gradebookTeachers((row.subject as { employee?: unknown } | undefined)?.employee),
      admit: admitRow ? { absence_count_all: admitRow.absence_count_all, avaibale_count_all: admitRow.avaibale_count_all, lessons_count: admitRow.lessons_count, admit: admitRow.admit as LmsAdmit["admit"] } : null,
      events: (row.events ?? []).map((e: LmsAttendanceEvent) => syncedEvent(e as LmsAttendanceEvent & { mark?: unknown })),
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

/** `auditorium` is a string, `{ name }`, or (real `/schedule/list`) `{ aud_num: "306", campus: { name } }`. */
const roomOf = (a: ScheduleEvent["auditorium"]) => {
  if (typeof a === "string") return a.trim() || null;
  const r = (a ?? {}) as { name?: string | null; aud_num?: string | null };
  return (r.name ?? "").trim() || (r.aud_num ?? "").toString().trim() || null;
};

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
      kind: kindOfLessonType((e.subjectType as { type?: string | number } | null | undefined)?.type, e.subjectType?.name ?? type), was: moved ?? prior?.was ?? null,
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Every LMS notification once, from whichever tabs the payload has. */
export function lmsNotifications(payload: LmsNotificationsPayload | null | undefined): LmsNotification[] {
  if (!payload) return [];
  // Every tab, whatever it is called: `all`, `notification`, `advertise`,
  // `advertise_required`, `offer`, `polls_event` and any the LMS adds.
  const all = Object.values(payload as Record<string, unknown>).flatMap((v) => (Array.isArray(v) ? (v as LmsNotification[]) : []));
  const by = new Map<string, LmsNotification>();
  for (const n of all) if (n && n.id !== undefined && n.id !== null && !by.has(String(n.id))) by.set(String(n.id), n);
  return [...by.values()];
}

export function announcementAlerts(list: LmsNotification[]): Alert[] {
  return list.map((n) => {
    const item = { ...fromLms(n), href: path({ to: "notifications", id: `lms:${n.id}` }) };
    return { item, setting: "announcement" as const, message: msg.announcement({ id: item.id, title: item.title, course: item.courseName ?? "", teacher: item.author ?? null, needsAck: !!item.needsAck }) };
  });
}

type Named = (subjectId: string) => { name: string; code: string };

/**
 * "New grade" for marks that changed since the last sync. `known`: courses the
 * last snapshot already had; a course seen for the first time (an older
 * semester pulled in, a new enrolment) is only remembered, never announced.
 */
export function gradeAlerts(prev: Record<string, number | null>, courses: SyncedCourse[], at: Date, named: Named, known?: Set<string>): Alert[] {
  const seen = known ? courses.filter((c) => known.has(`${c.semesterId}|${c.subjectId}`)) : courses;
  const changes = changedGrades(prev, marksOf(seen));
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
      message: msg.newGrade({ grade: mark, course: name, courseId: subjectId, item: part === "final" ? "Final grade" : lessonLabel(lesson.join(":")), max: part === "final" ? 100 : null, average }),
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
        item: { id: `absence:${c.subjectId}:${e.lesson}`, kind: "absence", title: `Marked absent${a ? ` · ${a.left} left` : ""}`, body: [name, e.lesson, date].filter(Boolean).join(" · "), courseId: c.subjectId, at, read: false, href: path({ to: "progress", courseId: c.subjectId }) },
        message: msg.markedAbsent({ course: name, courseId: c.subjectId, lesson: e.lesson, when: date && e.at ? `${date} ${clock(e.at)}` : null, left: a?.left ?? null, status: a?.status ?? null }),
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

/**
 * The absences and marked classes a course already had when Press F first saw
 * it, as read feed items dated at the class: the Absences and Grades tabs show
 * the semester so far, and nothing is sent to the bot (read items never are).
 */
export function historyAlerts(courses: SyncedCourse[], now: Date, named: Named): Alert[] {
  const out: Alert[] = [];
  for (const c of courses) {
    const { name } = named(c.subjectId);
    const events = attendanceEvents(c.events);
    events.forEach((e, i) => {
      const at = e.at && e.at <= now ? e.at : now;
      const date = e.at ? `${weekdayName(e.at).slice(0, 3)} ${shortDate(e.at)}` : null;
      if (e.mark === "absent") {
        out.push({
          setting: "absence",
          item: { id: `absence:${c.subjectId}:${e.lesson}`, kind: "absence", title: "Marked absent", body: [name, e.lesson, date].filter(Boolean).join(" · "), courseId: c.subjectId, at, read: true, href: path({ to: "progress", courseId: c.subjectId }) },
          message: msg.markedAbsent({ course: name, courseId: c.subjectId, lesson: e.lesson, when: date && e.at ? `${date} ${clock(e.at)}` : null, left: null }),
        });
      }
      const mark = num(c.events[i]?.mark);
      if (mark !== null) {
        const key = `${c.subjectId}:ev:${c.events[i]?.time ?? ""}:${e.lesson}`;
        out.push({
          setting: "grade",
          item: { id: `grade:${key}:${mark}`, kind: "grade", title: `Grade: ${mark} for the ${e.lesson.toLowerCase()}`, body: [name, date].filter(Boolean).join(" · "), courseId: c.subjectId, at, read: true, href: path({ to: "progress", courseId: c.subjectId }) },
          message: msg.newGrade({ grade: mark, course: name, courseId: c.subjectId, item: lessonLabel(e.lesson), average: c.average }),
        });
      }
    });
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
  const count = `${files.length} new ${files.length === 1 ? "file" : "files"}`;
  return {
    setting: "file",
    item: {
      id: `files:${course.id}:${files.map((f) => f.id).sort().join(",")}`.slice(0, 200), kind: "file",
      // The title names the course; the files themselves are listed in the body.
      title: files.length === 1 ? `New file in ${course.name}: ${files[0].title}` : `${count} in ${course.name}`,
      body: [week ? `Week ${week}` : null, files.length > 1 ? fileList(files.map((f) => f.title)) : null].filter(Boolean).join(" · ") || undefined,
      courseId: course.id, courseName: course.name, at: now, read: false, href: path({ to: "course", code: course.code }),
    },
    message: msg.newFiles({ course: course.name, courseCode: course.code, week, files: files.map((f) => f.title) }),
  };
}
