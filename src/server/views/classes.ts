import { mergeBlocks, type ClassBlock, type ClassEvent } from "@/core/agenda";
import { dayInfo, weekOf } from "@/core/semester";
import { addDays, clock, dayStart, localDay } from "@/core/time";
import type { ExamKind } from "@/core/exams";
import { examNote, examRoomText, examsFor, examWindowList, hidingWindows, type StudentExam } from "@/server/exams";
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
  /** Set on an exam from a university exam sheet. */
  exam?: { kind: ExamKind; window: string; note: string; rooms: string[]; matched: StudentExam["matched"] } | null;
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

/**
 * Exam weeks: while an exam window hides classes, regular LMS classes are left
 * out and the student's exams from the university sheets are shown instead.
 * Outside the windows nothing changes. A failure here never breaks the timetable.
 */
async function withExams(student: Student, list: Event[], fromDay: string, toDay: string): Promise<{ events: Event[]; exams: StudentExam[] }> {
  let windows, exams: StudentExam[];
  try {
    [windows, exams] = await Promise.all([examWindowList(), examsFor(student, fromDay, toDay)]);
  } catch (error) {
    console.error("exam layer failed", error instanceof Error ? error.message : error);
    return { events: list, exams: [] };
  }
  const hidden = hidingWindows(windows, fromDay, toDay);
  const hiddenDay = (d: string) => hidden.some((w) => w.starts <= d && d <= w.ends);
  const examCourses = new Set(exams.flatMap((x) => [x.courseId, x.code]).filter(Boolean));
  const kept = list.filter((e) => {
    if (e.kind === "exam") return !examCourses.has(e.courseId) && !(e.code && examCourses.has(e.code));
    return !hiddenDay(localDay(e.start));
  });
  for (const x of exams) {
    kept.push({ courseId: x.courseId ?? x.code, courseName: x.name, code: x.code, kind: "exam", start: x.start, end: x.end, room: examRoomText(x) ?? undefined, changedFrom: x.was ?? undefined });
  }
  return { events: kept, exams };
}

async function events(student: Student, fromDay: string, toDay: string, today: string): Promise<{ events: Event[]; courses: Map<string, CourseRef>; exams: StudentExam[] }> {
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
      changedFrom: c.was ?? undefined,
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
  const layered = await withExams(student, out, fromDay, toDay);
  return { events: layered.events, courses, exams: layered.exams };
}

export async function classesBetween(student: Student, fromDay: string, toDay: string, now: Date): Promise<ClassView[]> {
  const { events: list, exams } = await events(student, fromDay, toDay, localDay(now));
  const examAt = new Map(exams.map((x) => [`${x.courseId ?? x.code}|${x.start.getTime()}`, x]));
  const teacherOf = new Map<string, string | null | undefined>();
  for (const e of list) teacherOf.set(`${e.courseId}|${e.start.getTime()}`, e.teacherId);
  const blocks = mergeBlocks(list);
  const teachers = await teachersByIds(blocks.map((b) => teacherOf.get(`${b.courseId}|${b.start.getTime()}`) ?? "").filter(Boolean));
  let nextMarked = false;
  return blocks.map((b) => {
    const tid = teacherOf.get(`${b.courseId}|${b.start.getTime()}`) ?? null;
    const teacher = tid ? teachers.get(tid) : undefined;
    const x = b.kind === "exam" ? examAt.get(`${b.courseId}|${b.start.getTime()}`) : undefined;
    const status = b.end <= now ? "done" : b.start <= now ? "now" : !nextMarked && localDay(b.start) === localDay(now) ? ((nextMarked = true), "next") : "later";
    return {
      key: `${b.courseId}@${b.start.toISOString()}`, courseId: b.courseId, code: b.code ?? "", name: b.courseName, kind: b.kind,
      start: b.start.toISOString(), end: b.end.toISOString(), time: clock(b.start), endTime: clock(b.end), room: b.room ?? null,
      teacher: teacher ? { id: teacher.id, name: teacher.name } : null, changedFrom: b.changedFrom ?? null, lessonIds: b.lessonIds, status,
      ...(x ? { exam: { kind: x.kind, window: x.window, note: examNote(x), rooms: x.rooms, matched: x.matched } } : {}),
    };
  });
}

/** Back to core blocks (Dates) for agenda logic. */
export const toBlocks = (views: ClassView[]): ClassBlock[] =>
  views.map((v) => ({ courseId: v.courseId ?? v.code, courseName: v.name, code: v.code, kind: v.kind, start: new Date(v.start), end: new Date(v.end), room: v.room ?? undefined, lessonIds: v.lessonIds, changedFrom: v.changedFrom ?? undefined }));

export { kindOf };
