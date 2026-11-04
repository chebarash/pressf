import { inArray } from "drizzle-orm";
import { CLASS_KIND_LABEL } from "@/core/agenda";
import { classTime } from "@/core/attendance";
import { dayInfo } from "@/core/semester";
import { dayStart, localDay } from "@/core/time";
import { db } from "@/lib/db";
import { lmsCourses, lmsFiles, syllabi } from "@/lib/db/schema";
import type { LmsLesson, LmsSubject } from "@/lib/lms/types";
import { fileOverridesMap, overlayAll } from "@/server/decisions";
import { num } from "@/server/sync/convert";
import type { SyncedCourse, SyncedEvent } from "@/server/sync/types";
import type { ClassView } from "./classes";
import { progressCourses, type AbsencesView } from "./progress";
import { deadlines, lmsFileItem, sameCourse, STATUS_LABEL, teacherNamesByCode, type FileItem } from "./shared";
import type { Student } from "./student";

/**
 * One dated lesson, not the course in general: what the timetable's panel
 * (desktop inspector, phone sheet) shows when a class is clicked. Everything is
 * read from what the sync already stored; nothing here calls the LMS.
 *
 * - the LMS lesson: the dated schedule's `lesson_id`, else the gradebook entry
 *   matched by date and time (weekly-pattern classes have no id of their own);
 * - its name/topic and type from the course's lessons (`/subject/get-by-id`),
 *   or, for a lesson the LMS has not dated yet, the syllabus topic of that week;
 * - attendance and the mark from the gradebook entry of that lesson;
 * - the files attached to that lesson, and homework of the course due that day.
 */

export type AttendanceMark = "present" | "late" | "absent" | "excused" | "unmarked" | "upcoming";

export type LessonInfo = {
  /** The LMS lesson id, when known (dated schedule or a matched gradebook entry). */
  lessonId: string | null;
  /** The lesson's name in the LMS ("Lecture № 15", or the teacher's own title). */
  title: string | null;
  /** The LMS lesson description, when the teacher wrote one. */
  description: string | null;
  /** The syllabus topic of that teaching week ("Week 8 · Derivatives"), for every lesson of a course with a syllabus. */
  syllabus: string | null;
  /** "Lecture", "Tutorial", "Laboratory", "Exam"… */
  type: string;
  attendance: { mark: AttendanceMark; label: string; viaQr: boolean };
  /** The mark the teacher gave in that lesson, as the LMS shows it. */
  grade: string | null;
  files: FileItem[];
  homework: Array<{ id: string; title: string; due: string; status: string; grade: number | null }>;
  absences: AbsencesView | null;
};

export const LMS_SITE = "https://newuzbekistan.hero.study";

const STATUS: Record<string, Exclude<AttendanceMark, "upcoming">> = { "0": "unmarked", "1": "present", "2": "late", "3": "absent", "4": "excused" };
const MARK_LABEL: Record<AttendanceMark, string> = { present: "Present", late: "Late", absent: "Absent", excused: "Excused", unmarked: "Not marked", upcoming: "Not marked yet" };
/** A gradebook entry belongs to a class when it is within this much of the class start. */
const MATCH_MS = 90 * 60_000;

type Lesson = Pick<ClassView, "courseId" | "code" | "name" | "kind" | "start" | "end" | "lessonIds">;

/**
 * The gradebook entry of one dated lesson: by lesson id first, else the entry
 * of the same course closest to the class start on that day (within 90 min).
 */
export function gradebookEntry(events: SyncedEvent[], c: Pick<Lesson, "start" | "lessonIds">): SyncedEvent | null {
  const ids = new Set(c.lessonIds.map(String));
  const byId = events.find((e) => e.lesson_id !== undefined && e.lesson_id !== null && ids.has(String(e.lesson_id)));
  if (byId) return byId;
  const start = Date.parse(c.start);
  const day = localDay(new Date(start));
  let best: SyncedEvent | null = null;
  let gap = Infinity;
  for (const e of events) {
    const at = classTime(e);
    if (!at || localDay(at) !== day) continue;
    const d = Math.abs(at.getTime() - start);
    if (d <= MATCH_MS && d < gap) [best, gap] = [e, d];
  }
  return best;
}

/** Attendance for a lesson: the gradebook's mark; today or later and nothing marked yet: "Not marked yet". */
export function attendanceOf(entry: SyncedEvent | null, c: Pick<Lesson, "start">, now: Date): LessonInfo["attendance"] {
  const status = entry ? STATUS[String(entry.status ?? 0)] ?? "unmarked" : "unmarked";
  const mark: AttendanceMark = status === "unmarked" && localDay(new Date(c.start)) >= localDay(now) ? "upcoming" : status;
  const viaQr = !!entry && String(entry.qr_auto_set_status ?? "") === "1" && (mark === "present" || mark === "late");
  return { mark, label: mark === "unmarked" && !entry ? "Not in the LMS gradebook" : MARK_LABEL[mark], viaQr };
}

/** Homework of the lesson's course due on the lesson's day. */
export function homeworkFor(list: Student["sync"]["homework"], c: Pick<Lesson, "courseId" | "name" | "start">) {
  const day = localDay(new Date(c.start));
  const own = (h: (typeof list)[number]) => {
    const s = h.subject;
    if (s && typeof s === "object") return (s as { id?: unknown }).id !== undefined && String((s as { id?: unknown }).id) === c.courseId ? true : sameCourse(s.name, c.name);
    return sameCourse(s, c.name);
  };
  const mine = list.filter(own);
  return deadlines(mine)
    .filter((d) => localDay(d.due) === day)
    .map((d) => ({ id: d.id, title: d.title, due: d.due.toISOString(), status: STATUS_LABEL[d.status], grade: d.grade }));
}

/** The syllabus topic of the teaching week a day falls in, from `topics_by_week`. */
export function syllabusTopic(topics: Record<number, string> | undefined, day: string): string | null {
  const week = dayInfo(dayStart(day)).week;
  if (!topics || !week || (week.kind !== "teaching" && week.kind !== "midterm")) return null;
  const n = week.week;
  return n && topics[n] ? `Week ${n} · ${topics[n]}` : null;
}

/** Lesson facts for every class given, keyed by the class key. */
export async function lessonInfos(student: Student, classes: ClassView[], now: Date): Promise<Map<string, LessonInfo>> {
  const out = new Map<string, LessonInfo>();
  if (!classes.length) return out;
  const gradebook = new Map<string, SyncedEvent[]>();
  for (const c of student.sync.courses as SyncedCourse[]) gradebook.set(c.subjectId, [...(gradebook.get(c.subjectId) ?? []), ...c.events]);

  // The LMS lesson of every class: its own id, else the gradebook entry's.
  const entries = new Map<string, SyncedEvent | null>();
  const ids = new Map<string, string | null>();
  for (const c of classes) {
    const entry = c.kind === "exam" ? null : gradebookEntry(gradebook.get(c.courseId ?? "") ?? [], c);
    entries.set(c.key, entry);
    ids.set(c.key, c.lessonIds[0] ?? (entry?.lesson_id !== undefined && entry?.lesson_id !== null ? String(entry.lesson_id) : null));
  }
  const lessonIds = [...new Set([...ids.values()].filter((x): x is string => !!x))];
  const courseIds = [...new Set(classes.map((c) => c.courseId ?? "").filter(Boolean))];
  const codes = [...new Set(classes.map((c) => c.code).filter(Boolean))];
  const [rows, raws, overrides, people, plans, progress] = await Promise.all([
    lessonIds.length ? db().select().from(lmsFiles).where(inArray(lmsFiles.lessonId, lessonIds)) : Promise.resolve([]),
    courseIds.length ? db().select({ id: lmsCourses.id, raw: lmsCourses.raw }).from(lmsCourses).where(inArray(lmsCourses.id, courseIds)) : Promise.resolve([]),
    lessonIds.length ? fileOverridesMap() : Promise.resolve({}),
    teacherNamesByCode(),
    codes.length ? db().select({ code: syllabi.courseCode, data: syllabi.data, matched: syllabi.matched }).from(syllabi).where(inArray(syllabi.courseCode, codes)) : Promise.resolve([]),
    progressCourses(student, now),
  ]);
  const lessons = new Map<string, LmsLesson & { description?: string | null }>();
  for (const r of raws) for (const l of ((r.raw as LmsSubject)?.lessons ?? []) as LmsLesson[]) if (l?.id !== undefined) lessons.set(String(l.id), l);
  const topics = new Map<string, Record<number, string>>();
  for (const p of plans.filter((x) => x.matched)) {
    if (topics.has(p.code)) continue;
    const t: Record<number, string> = {};
    for (const w of p.data.topics_by_week ?? []) {
      const n = Number(w.week.match(/\d+/)?.[0]);
      if (n && !t[n] && w.topic) t[n] = w.topic;
    }
    topics.set(p.code, t);
  }

  for (const c of classes) {
    const entry = entries.get(c.key) ?? null;
    const id = ids.get(c.key) ?? null;
    const l = id ? lessons.get(id) : undefined;
    const files = id ? rows.filter((f) => f.lessonId === id).map((f) => lmsFileItem(f, { code: c.code, name: c.name, teachers: people[c.code] }, new Map())) : [];
    const day = localDay(new Date(c.start));
    const grade = entry ? num(entry.mark) : null;
    out.set(c.key, {
      lessonId: id,
      title: c.kind === "exam" ? null : (l?.name ?? entry?.lesson_name ?? null)?.trim() || null,
      description: (l?.description ?? "").trim() || null,
      syllabus: c.kind === "exam" ? null : syllabusTopic(topics.get(c.code), day),
      type: c.exam ? (c.exam.kind === "midterm" ? "Midterm" : c.exam.kind === "final" ? "Final exam" : "Exam") : l?.lessonType?.name?.trim() || CLASS_KIND_LABEL[c.kind],
      attendance: c.kind === "exam" ? { mark: "unmarked", label: "", viaQr: false } : attendanceOf(entry, c, now),
      grade: grade !== null ? String(grade) : null,
      files: overlayAll(files, overrides),
      homework: homeworkFor(student.sync.homework, c),
      absences: progress.find((p) => p.courseId === c.courseId)?.absences ?? null,
    });
  }
  return out;
}
