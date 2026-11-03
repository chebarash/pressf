import { attendance, attendanceEvents, attendanceLine, type AttendanceStatus, type Mark } from "@/core/attendance";
import { tier } from "@/core/grades";
import { DAY_MS, shortDate, weekdayName } from "@/core/time";
import { termName, type SyncedCourse } from "@/server/sync/types";
import { rateQueueFor } from "./rate";
import { coursesByIds, deadlines, deadlineView, sameCourse, teachersByIds, type CourseRef, type DeadlineView } from "./shared";
import { loadStudent, type Student, type SyncState } from "./student";
import { db } from "@/lib/db";
import { lmsCourseTeachers } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { roleOf } from "@/core/people";
import { termMatches, termSlug } from "@/core/semester";

/** Progress (Figma 5.1–5.6): marks, absences and work per course, from the LMS gradebook. */

export type AbsencesView = { missed: number; left: number; limit: number; status: AttendanceStatus; line: string };

export type ProgressCourse = {
  courseId: string;
  code: string;
  name: string;
  /** The number on the left: the running average, or the final mark once in. */
  mark: number | null;
  tier: ReturnType<typeof tier>;
  average: number | null;
  rating: number | null;
  final: number | null;
  passed: boolean | null;
  fx: boolean;
  /** Midterm exam, admission rating and final-exam mark, when the LMS has them. */
  midterm?: number | null;
  admission?: number | null;
  exam?: number | null;
  /** Admitted to the final exam ("Permit"); null when the LMS has not said. */
  admitted?: boolean | null;
  absences: AbsencesView | null;
  next: DeadlineView | null;
  href: string;
};

/** The headline number: the final once in, else the running rating, else the average. */
const headline = (c: SyncedCourse) => c.final ?? c.rating ?? c.average;
const extras = (c: SyncedCourse) => ({ midterm: c.midterm ?? null, admission: c.admission ?? null, exam: c.exam ?? null, admitted: c.admitted ?? null });

export type ProgressView = {
  state: SyncState;
  gpa: number | null;
  ectsEarned: number | null;
  ectsTotal: number | null;
  /** How many semesters the student has been enrolled, counting this one. */
  semesterNumber: number | null;
  currentTerm: string | null;
  courses: ProgressCourse[];
  /** `href`: that semester's results (/progress/term/fall-2025). Always set by the server. */
  earlier: Array<{ term: string; courses: number; ects: number | null; gpa: number | null; href?: string }>;
  rate: { term: string | null; waiting: number; rated: number };
  /** No marks yet anywhere (Figma 5.3). */
  empty: boolean;
  /** All final marks of the current semester are in (Figma 5.6). */
  /** `gpa`: the semester GPA when the LMS transcript lists one, else null. */
  results: { term: string; gpa?: number | null; courses: Array<{ courseId: string; name: string; mark: number | null; passed: boolean | null; fx: boolean }> } | null;
};

const absencesOf = (c: SyncedCourse): AbsencesView | null => {
  const a = attendance(c.admit);
  return a ? { missed: a.missed, left: a.left, limit: a.limit, status: a.status, line: attendanceLine(a) } : null;
};

/** The current semester's courses with marks, absences and the next deadline. */
export async function progressCourses(student: Student, now: Date): Promise<ProgressCourse[]> {
  const open = new Set(student.sync.semesters.filter((s) => s.open).map((s) => s.id));
  const current = student.sync.courses.filter((c) => open.has(c.semesterId));
  const refs = await coursesByIds(current.map((c) => c.subjectId));
  const work = deadlines(student.sync.homework).filter((d) => (d.status === "todo" || d.status === "in-progress") && d.due >= now);
  const rows: ProgressCourse[] = current.map((c) => {
    const ref = refs.get(c.subjectId);
    const name = ref?.name ?? c.name;
    const next = work.filter((d) => sameCourse(d.course, name) || sameCourse(d.course, c.name)).sort((a, b) => a.due.getTime() - b.due.getTime())[0];
    const mark = headline(c);
    return {
      courseId: c.subjectId, code: ref?.code ?? "", name, mark, tier: tier(mark), average: c.average, rating: c.rating, final: c.final,
      passed: c.passed, fx: c.fx, ...extras(c), absences: absencesOf(c), next: next ? deadlineView(next, now) : null, href: `/progress/${c.subjectId}`,
    };
  });
  if (rows.length || !student.cache?.enrollment) return rows;
  // Before the first gradebook sync: the enrolled courses, without marks.
  return student.cache.enrollment.courses.map((c) => ({
    courseId: c.code, code: c.code, name: c.subject, mark: null, tier: "None", average: null, rating: null, final: null, passed: null, fx: false, absences: null, next: null, href: `/progress`,
  }));
}

export async function progress(userId: string, now = new Date()): Promise<ProgressView | null> {
  const student = await loadStudent(userId);
  if (!student) return null;
  const [courses, queue] = await Promise.all([progressCourses(student, now), rateQueueFor(student, now)]);
  const profile = student.cache?.profile ?? null;
  const open = student.sync.semesters.find((s) => s.open) ?? null;
  const { gpaOf, past } = semestersOf(student);
  const earlier = past.length
    ? past
        .map((s) => ({ term: s.term, courses: student.sync.courses.filter((c) => c.semesterId === s.id).length, ects: null, gpa: gpaOf(s.id, s.term), href: termHref(s.term) }))
        // A semester with nothing in the gradebook (an empty summer term) is not a semester studied.
        .filter((s) => s.courses > 0)
    : (profile?.semesters ?? []).filter((s) => !s.open).map((s) => ({ term: s.name, courses: s.courses.length, ects: null, gpa: gpaOf(null, s.name), href: termHref(s.name) }));
  const allFinal = courses.length > 0 && courses.every((c) => c.final !== null);
  return {
    state: student.state,
    gpa: profile?.gpa ?? null,
    ectsEarned: profile?.ectsEarned ?? null,
    ectsTotal: profile?.ectsTotal ?? null,
    semesterNumber: semesterNumber(student) || profile?.semesters.length || null,
    currentTerm: queue.currentTerm,
    courses,
    earlier,
    // The card names one semester, so its numbers are that semester's (older ones follow after it).
    rate: { term: queue.ask.term, waiting: queue.waiting.filter((w) => w.term === queue.ask.term).length, rated: queue.rated.filter((r) => r.term === queue.ask.term).length },
    empty: courses.every((c) => c.mark === null) && !profile?.gpa,
    results: allFinal && open ? { term: open.term, gpa: gpaOf(open.id, open.term), courses: courses.map((c) => ({ courseId: c.courseId, name: c.name, mark: c.final, passed: c.passed, fx: c.fx })) } : null,
  };
}

/** Semesters studied so far, this one included: those with courses in the gradebook (empty summers do not count). */
function semesterNumber(student: Student) {
  const withCourses = new Set(student.sync.courses.map((c) => c.semesterId));
  return student.sync.semesters.filter((s) => s.open || withCourses.has(s.id)).length;
}

/** A past semester's results page (Figma 5.6 layout, reached from "Earlier semesters"). */
export const termHref = (term: string) => `/progress/term/${termSlug(term)}`;

/** Closed semesters, newest first, and the per-semester GPA lookup (null when the transcript has none). */
function semestersOf(student: Student) {
  const gpas = student.cache?.profile?.semesterGpa ?? {};
  const byName = new Map(Object.entries(gpas).map(([k, v]) => [termName(k) || k, v]));
  const gpaOf = (id: string | null, term: string): number | null => (id ? gpas[id] : undefined) ?? gpas[term] ?? byName.get(termName(term) || term) ?? null;
  const past = student.sync.semesters.filter((s) => !s.open).sort((a, b) => Number(b.id) - Number(a.id));
  return { gpaOf, past };
}

export type TermResultCourse = {
  /** LMS subject id; null when the semester is known only from the transcript. */
  courseId: string | null;
  code: string;
  name: string;
  /** The final mark, or the last average when no final was recorded. */
  mark: number | null;
  passed: boolean | null;
  fx: boolean;
  ects: number | null;
  /** The course's marks and absences (/progress/<id>), null without an LMS id. */
  href: string | null;
};

export type TermResultsView = {
  state: SyncState;
  /** "Fall 2025". */
  term: string;
  /** Semester GPA when the LMS transcript lists one. */
  gpa: number | null;
  /** Overall GPA and credits, as on Progress. */
  overallGpa: number | null;
  ectsEarned: number | null;
  ectsTotal: number | null;
  /** ECTS of this semester's courses, when the catalog knows every one. */
  ects: number | null;
  courses: TermResultCourse[];
  passed: number;
  /** Courses of this semester still to rate (the "Rate <term>" card). */
  rate: { waiting: number; href: string } | null;
  curriculumHref: string;
};

/** A past semester's results: every course with its final mark and status (Figma 5.6 layout). */
export async function termResults(userId: string, segment: string, now = new Date()): Promise<TermResultsView | null> {
  const student = await loadStudent(userId);
  if (!student) return null;
  const { gpaOf, past } = semestersOf(student);
  const profile = student.cache?.profile ?? null;
  const synced = past.find((s) => termMatches(s.term, segment));
  const fromTranscript = synced ? null : (profile?.semesters ?? []).find((s) => !s.open && termMatches(termName(s.name) || s.name, segment));
  if (!synced && !fromTranscript) return null;
  const term = synced?.term ?? (termName(fromTranscript!.name) || fromTranscript!.name);

  const [queue, refs] = await Promise.all([
    rateQueueFor(student, now),
    synced ? coursesByIds(student.sync.courses.filter((c) => c.semesterId === synced.id).map((c) => c.subjectId)) : Promise.resolve(new Map<string, CourseRef>()),
  ]);
  const courses: TermResultCourse[] = synced
    ? student.sync.courses
        .filter((c) => c.semesterId === synced.id)
        .map((c) => {
          const ref = refs.get(c.subjectId);
          return { courseId: c.subjectId, code: ref?.code ?? "", name: ref?.name ?? c.name, mark: headline(c), passed: c.passed, fx: c.fx, ects: ref?.credits ?? null, href: `/progress/${c.subjectId}` };
        })
    : fromTranscript!.courses.map((c) => ({ courseId: null, code: "", name: c.name, mark: c.mark, passed: c.passed, fx: false, ects: null, href: null }));
  courses.sort((a, b) => (b.mark ?? -1) - (a.mark ?? -1) || a.name.localeCompare(b.name));
  const waiting = queue.waiting.filter((w) => w.term === term).length;
  return {
    state: student.state,
    term,
    gpa: gpaOf(synced?.id ?? null, term),
    overallGpa: profile?.gpa ?? null,
    ectsEarned: profile?.ectsEarned ?? null,
    ectsTotal: profile?.ectsTotal ?? null,
    ects: courses.length && courses.every((c) => c.ects !== null) ? courses.reduce((n, c) => n + (c.ects ?? 0), 0) : null,
    courses,
    passed: courses.filter((c) => c.passed).length,
    rate: waiting ? { waiting, href: "/rate" } : null,
    curriculumHref: "/programs/mine/curriculum",
  };
}

/** `mark`: present, late, absent, excused or unmarked; `viaQr`: checked in by scanning the class QR. */
export type ClassMark = { lesson: string; kind: "lecture" | "lab" | "practice"; at: string | null; dateLabel: string | null; mark: Mark; viaQr: boolean; score: number | null };

export type CourseProgressView = {
  state: SyncState;
  course: ProgressCourse;
  term: string | null;
  teacher: string | null;
  events: ClassMark[];
};

/** Figma 5.2: one course's marks and class-by-class attendance. */
export async function courseProgress(userId: string, courseId: string, now = new Date()): Promise<CourseProgressView | null> {
  const student = await loadStudent(userId);
  if (!student) return null;
  const synced = student.sync.courses.find((c) => c.subjectId === courseId);
  if (!synced) return null;
  const [rows, links] = await Promise.all([
    progressCourses(student, now),
    db().select().from(lmsCourseTeachers).where(inArray(lmsCourseTeachers.courseId, [courseId])),
  ]);
  const lead = links.find((l) => roleOf(l.role) === "lecture") ?? links[0];
  const people = await teachersByIds(lead ? [lead.teacherId] : []);
  const refs = rows.find((r) => r.courseId === courseId) ? null : await coursesByIds([courseId]);
  const ref = refs?.get(courseId);
  const course = rows.find((r) => r.courseId === courseId) ?? {
    courseId, code: ref?.code ?? "", name: ref?.name ?? synced.name, mark: headline(synced), tier: tier(headline(synced)),
    average: synced.average, rating: synced.rating, final: synced.final, passed: synced.passed, fx: synced.fx, ...extras(synced), absences: absencesOf(synced), next: null, href: `/progress/${courseId}`,
  };
  const marks = attendanceEvents(synced.events);
  const events: ClassMark[] = marks
    .map((e, i) => {
      const raw = Number(synced.events[i]?.mark);
      return {
        lesson: e.lesson, kind: e.kind, at: e.at?.toISOString() ?? null,
        dateLabel: e.at ? `${weekdayName(e.at).slice(0, 3)} ${shortDate(e.at)}` : null,
        mark: e.mark, viaQr: e.viaQr, score: synced.events[i]?.mark === null || synced.events[i]?.mark === undefined || synced.events[i]?.mark === "" || !Number.isFinite(raw) ? null : raw,
      };
    })
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return {
    state: student.state,
    course,
    term: student.sync.semesters.find((s) => s.id === synced.semesterId)?.term ?? null,
    teacher: (lead ? people.get(lead.teacherId)?.name : null) ?? synced.teachers?.[0] ?? null,
    events,
  };
}

export type CourseAttendance = { courseId: string; code: string; name: string; absences: AbsencesView | null };

/**
 * Attendance for one current course from the stored snapshot (no LMS call), for
 * "N absences left in this course" after a QR check-in. `course` may be the LMS
 * subject id, the course code or the course name (the QR answer carries a name).
 */
export async function courseAttendance(userId: string, course: string): Promise<CourseAttendance | null> {
  const student = await loadStudent(userId, { refresh: false });
  if (!student) return null;
  const open = new Set(student.sync.semesters.filter((s) => s.open).map((s) => s.id));
  const current = student.sync.courses.filter((c) => open.has(c.semesterId));
  const refs = await coursesByIds(current.map((c) => c.subjectId));
  const want = course.trim();
  const hit = current.find((c) => c.subjectId === want)
    ?? current.find((c) => (refs.get(c.subjectId)?.code ?? "").toUpperCase() === want.toUpperCase())
    ?? current.find((c) => sameCourse(c.name, want) || sameCourse(refs.get(c.subjectId)?.name, want));
  if (!hit) return null;
  const ref = refs.get(hit.subjectId);
  return { courseId: hit.subjectId, code: ref?.code ?? "", name: ref?.name ?? hit.name, absences: absencesOf(hit) };
}

export type AssignmentsView = {
  state: SyncState;
  dueThisWeek: DeadlineView[];
  later: DeadlineView[];
  waiting: DeadlineView[];
  graded: DeadlineView[];
  missed: DeadlineView[];
  /** Course progress page per homework course name (the rows' chevron, Figma 5.4). */
  courseHref?: Record<string, string>;
};

/** Figma 5.4: assignments by state, from the LMS homework list. */
export async function assignments(userId: string, now = new Date()): Promise<AssignmentsView | null> {
  const student = await loadStudent(userId);
  if (!student) return null;
  const list = deadlines(student.sync.homework).sort((a, b) => a.due.getTime() - b.due.getTime());
  const open = list.filter((d) => (d.status === "todo" || d.status === "in-progress") && d.due >= now);
  const week = now.getTime() + 7 * DAY_MS;
  const view = (xs: typeof list) => xs.map((d) => deadlineView(d, now));
  const courseHref: Record<string, string> = {};
  for (const d of list) {
    const c = student.sync.courses.find((x) => sameCourse(x.name, d.course));
    if (c) courseHref[d.course] = `/progress/${c.subjectId}`;
  }
  return {
    courseHref,
    state: student.state,
    dueThisWeek: view(open.filter((d) => d.due.getTime() <= week)),
    later: view(open.filter((d) => d.due.getTime() > week)),
    waiting: view(list.filter((d) => d.status === "submitted")),
    graded: view(list.filter((d) => d.status === "checked").reverse()),
    missed: view(list.filter((d) => d.status === "missed" || ((d.status === "todo" || d.status === "in-progress") && d.due < now)).reverse()),
  };
}
