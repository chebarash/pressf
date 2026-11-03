import { mergeBlocks, type ClassBlock, type ClassEvent } from "@/core/agenda";
import { sameRoom } from "@/server/sync/convert";
import { dayInfo, weekOf } from "@/core/semester";
import { addDays, clock, dayStart, localDay } from "@/core/time";
import { coursesByCodes, coursesByIds, kindOf, teachersByIds, type CourseRef } from "./shared";
import type { Student } from "./student";

/**
 * A student's classes on given days: the dated LMS schedule from the last sync
 * where it covers the day, otherwise the weekly pattern from sign-in, skipped
 * on holidays, breaks and weekends. The pattern is this semester's, so it only
 * fills this semester's class weeks: never another term (it used to paint
 * Fall classes over Spring 2027) and never exam, resit or induction weeks.
 */

export type ClassView = {
  key: string;
  courseId: string | null;
  code: string;
  name: string;
  kind: ClassBlock["kind"];
  start: string;
  end: string;
  time: string;
  endTime: string;
  room: string | null;
  teacher: { id: string; name: string } | null;
  /** "B-110" when the room changed, "10:00" when the time changed. */
  changedFrom: string | null;
  lessonIds: string[];
  status: "done" | "now" | "next" | "later";
};

type Event = ClassEvent & { teacherId?: string | null };

const at = (day: string, time: string) => new Date(`${day}T${time.length === 5 ? time : time.slice(0, 5)}:00+05:00`);

/** Raw events for [fromDay, toDay], both YYYY-MM-DD. */
/** Week kinds with regular classes, where the weekly pattern may stand in for the dated schedule. */
const PATTERN_WEEKS = new Set(["teaching", "midterm"]);

/** Days the weekly pattern (captured around `today`) may fill: study days of the same term's class weeks. */
export function patternFits(day: string, today: string) {
  const term = weekOf(today)?.term;
  const info = dayInfo(dayStart(day));
  return !!term && info.studyDay && info.week?.term === term && PATTERN_WEEKS.has(info.week.kind);
}

async function events(student: Student, fromDay: string, toDay: string, today: string): Promise<{ events: Event[]; courses: Map<string, CourseRef> }> {
  const window = student.sync.scheduleWindow;
  const covered = (day: string) => !!window && window.from <= day && day <= window.to;

  const dated = student.sync.schedule.filter((c) => {
    const day = localDay(new Date(c.start));
    return day >= fromDay && day <= toDay && covered(day);
  });

  const weekly = student.cache?.timetable ?? [];
  const patternDays: string[] = [];
  for (let d = fromDay; d <= toDay; d = addDays(d, 1)) if (!covered(d) && patternFits(d, today)) patternDays.push(d);

  const [byId, byCode] = await Promise.all([
    coursesByIds(dated.map((c) => c.subjectId)),
    coursesByCodes(patternDays.length ? weekly.map((l) => l.code) : []),
  ]);
  const enrolledIds = new Set(student.sync.courses.map((c) => c.subjectId));
  const idForCode = new Map<string, CourseRef>();
  for (const c of byCode) if (!idForCode.has(c.code) || enrolledIds.has(c.id)) idForCode.set(c.code, c);

  const out: Event[] = dated.map((c) => {
    const course = byId.get(c.subjectId);
    return {
      courseId: c.subjectId, courseName: course?.name ?? "Class", code: course?.code, kind: c.kind,
      start: new Date(c.start), end: new Date(c.end), room: c.room ?? undefined, teacherId: c.teacherId, lessonId: c.lessonId ?? undefined,
      // "306" → "MATH 306" is the same room written two ways, not a move.
      changedFrom: c.was && !sameRoom(c.was, c.room) ? c.was : undefined,
    };
  });
  for (const day of patternDays) {
    const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // LMS weekly pattern: 0 = Monday
    for (const l of weekly.filter((x) => x.day === weekday)) {
      const course = idForCode.get(l.code);
      out.push({
        courseId: course?.id ?? l.code, courseName: l.subject, code: l.code, kind: l.kind ?? "other",
        start: at(day, l.starts), end: at(day, l.ends || l.starts), room: l.room ?? undefined, teacherId: l.teacher,
      });
    }
  }
  const courses = new Map(byId);
  for (const c of idForCode.values()) courses.set(c.id, c);
  return { events: out, courses };
}

export async function classesBetween(student: Student, fromDay: string, toDay: string, now: Date): Promise<ClassView[]> {
  const { events: list } = await events(student, fromDay, toDay, localDay(now));
  const teacherOf = new Map<string, string | null | undefined>();
  for (const e of list) teacherOf.set(`${e.courseId}|${e.start.getTime()}`, e.teacherId);
  const blocks = mergeBlocks(list);
  const teachers = await teachersByIds(blocks.map((b) => teacherOf.get(`${b.courseId}|${b.start.getTime()}`) ?? "").filter(Boolean));
  let nextMarked = false;
  return blocks.map((b) => {
    const tid = teacherOf.get(`${b.courseId}|${b.start.getTime()}`) ?? null;
    const teacher = tid ? teachers.get(tid) : undefined;
    const status = b.end <= now ? "done" : b.start <= now ? "now" : !nextMarked && localDay(b.start) === localDay(now) ? ((nextMarked = true), "next") : "later";
    return {
      key: `${b.courseId}@${b.start.toISOString()}`, courseId: b.courseId, code: b.code ?? "", name: b.courseName, kind: b.kind,
      start: b.start.toISOString(), end: b.end.toISOString(), time: clock(b.start), endTime: clock(b.end), room: b.room ?? null,
      teacher: teacher ? { id: teacher.id, name: teacher.name } : null, changedFrom: b.changedFrom ?? null, lessonIds: b.lessonIds, status,
    };
  });
}

/** Back to core blocks (Dates) for agenda logic. */
export const toBlocks = (views: ClassView[]): ClassBlock[] =>
  views.map((v) => ({ courseId: v.courseId ?? v.code, courseName: v.name, code: v.code, kind: v.kind, start: new Date(v.start), end: new Date(v.end), room: v.room ?? undefined, lessonIds: v.lessonIds, changedFrom: v.changedFrom ?? undefined }));

export { kindOf };
