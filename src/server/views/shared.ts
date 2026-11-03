import { and, count, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { ClassKind } from "@/core/agenda";
import { deadline, type Deadline, type DeadlineStatus } from "@/core/deadlines";
import { describeFile, fileList, FORMAT_CODE, TYPE_LABEL, type FileFormat, type FileType } from "@/core/files";
import { attendanceMark, gradeMark, MARK_LABEL, type AttendanceMark, type GradebookCourse, type GradeMark } from "@/core/feed-marks";
import type { FeedItem, FeedKind } from "@/core/notifications";
import { mergeProfile } from "@/core/faculty";
import { roleOf, teacherName } from "@/core/people";
import { summarizeCourse, summarizeTeacher, toHours, type CourseSummary, type StoredRating, type TeacherRole, type TeacherSummary } from "@/core/ratings";
import { weekOf as calendarWeekOf } from "@/core/semester";
import { ago, clock, localDay, localWeekday, shortDate, toLocal, until } from "@/core/time";
import { shownAs } from "@/core/uploads";
import { db } from "@/lib/db";
import { courseRatings, faces, facultyPeople, lmsCourseTeachers, lmsCourses, lmsFiles, lmsSemesters, lmsTeachers, mentionLinks, mentions, teacherOverrides, teacherRatings, uploads, type LmsSemesterPhase } from "@/lib/db/schema";
import { termName } from "@/server/sync/types";
import type { LmsHomework, LmsLesson, LmsSubject } from "@/lib/lms/types";
import { DECISION_TAGS, fileOverridesMap, overlayAll, postVisible } from "@/server/decisions";
import { publicCache, TAGS } from "./cache";

/* ───────────── time ───────────── */

export const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** LMS times come as unix seconds, milliseconds or "YYYY-MM-DD HH:mm:ss" in Tashkent. */
export function lmsTime(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (Number.isFinite(n)) return n > 0 ? new Date(n < 1e12 ? n * 1000 : n) : null;
  const s = String(v).trim().replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}+05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Thursday 23:59", "Today 23:59", "Tomorrow 09:00", "5 Nov 10:00". */
export function whenLabel(at: Date, now: Date) {
  const days = Math.round((Date.parse(localDay(at)) - Date.parse(localDay(now))) / 86_400_000);
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days > 1 && days < 7 ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][localWeekday(at)] : shortDate(at);
  return `${day} ${clock(at)}`;
}

/* ───────────── courses and teachers ───────────── */

export type CourseRef = { id: string; code: string; name: string; credits: number | null; semesterId: string | null; departmentId: string | null };

const courseCols = { id: lmsCourses.id, code: lmsCourses.code, name: lmsCourses.name, credits: lmsCourses.credits, semesterId: lmsCourses.semesterId, departmentId: lmsCourses.departmentId };

export async function coursesByIds(ids: string[]): Promise<Map<string, CourseRef>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await db().select(courseCols).from(lmsCourses).where(inArray(lmsCourses.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Every LMS subject id per code (a code has one id per semester it ran). */
export async function coursesByCodes(codes: string[]): Promise<CourseRef[]> {
  const unique = [...new Set(codes.filter(Boolean))];
  if (!unique.length) return [];
  return db().select(courseCols).from(lmsCourses).where(inArray(lmsCourses.code, unique));
}

export type TeacherRef = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  /** School from the admin or the faculty site; null when only the LMS knows (callers derive it from the course). */
  school: string | null;
  /** Drawn face URL (`/faces/<id>`), null when none is assigned. */
  face: string | null;
};

/** Teachers as shown: admin overrides, then the faculty site (newuu.uz), then the LMS. */
export async function teachersByIds(ids: string[]): Promise<Map<string, TeacherRef>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const [rows, imported, overrides] = await Promise.all([
    db()
      .select({ id: lmsTeachers.id, firstName: lmsTeachers.firstName, lastName: lmsTeachers.lastName, surName: lmsTeachers.surName, position: lmsTeachers.position, department: lmsTeachers.department, faceAt: faces.updatedAt })
      .from(lmsTeachers)
      .leftJoin(faces, eq(faces.teacherId, lmsTeachers.id))
      .where(inArray(lmsTeachers.id, unique)),
    db().select({ teacherId: facultyPeople.teacherId, position: facultyPeople.position, department: facultyPeople.department, school: facultyPeople.school }).from(facultyPeople).where(inArray(facultyPeople.teacherId, unique)),
    db().select().from(teacherOverrides).where(inArray(teacherOverrides.teacherId, unique)),
  ]);
  const site = new Map(imported.map((r) => [r.teacherId!, r]));
  const over = new Map(overrides.map((r) => [r.teacherId, r]));
  return new Map(
    rows.map((t) => {
      const p = mergeProfile({ name: teacherName(t), position: t.position, department: t.department }, site.get(t.id), over.get(t.id));
      return [t.id, { id: t.id, name: p.name ?? teacherName(t), position: p.position, department: p.department, school: p.school, face: t.faceAt ? faceUrl(t.id, t.faceAt) : null }];
    })
  );
}

/**
 * The drawn face (never a photo), served by the faces route. `?v=` changes with
 * every new face, so the route can cache each version for a year.
 */
export const faceUrl = (teacherId: string, version?: Date | string | null) => {
  const at = version ? new Date(version).getTime() : NaN;
  return `/faces/${encodeURIComponent(teacherId)}${Number.isFinite(at) ? `?v=${at.toString(36)}` : ""}`;
};

export const ROLE_LABEL: Record<TeacherRole, string> = { lecture: "Lectures", tutorial: "Tutorials", lab: "Labs", practice: "Practice", other: "Teaching" };

export function kindOf(name: string | null | undefined): ClassKind {
  const t = (name ?? "").toLowerCase();
  if (/exam|midterm|final|quiz|control/.test(t)) return "exam";
  if (t.startsWith("lect")) return "lecture";
  if (t.startsWith("lab")) return "lab";
  if (/prac|tut|sem/.test(t)) return "practice";
  return "other";
}

export type Slot = { teacherId: string | null; role: TeacherRole; weekday: number; time: string; end: string | null; room: string | null; lessonId: string; lessonName: string; at: string };

/** Weekly slots from a harvested course's lessons (`raw.lessons[].schedule[]`). */
export function lessonSlots(raw: unknown): Slot[] {
  const lessons = ((raw as LmsSubject | null)?.lessons ?? []) as LmsLesson[];
  const out: Slot[] = [];
  for (const l of lessons) {
    for (const s of l.schedule ?? []) {
      const start = lmsTime(s.begin_time);
      if (!start) continue;
      const end = lmsTime(s.end_time);
      const slot: Slot = {
        teacherId: s.employee?.employee_id ?? null,
        role: roleOf(s.employee?.employee_type ?? l.lessonType?.name),
        weekday: localWeekday(start), time: clock(start), end: end ? clock(end) : null,
        room: s.auditorium || null, lessonId: l.id, lessonName: l.name, at: start.toISOString(),
      };
      out.push(slot);
    }
  }
  return out;
}

/** "Mon, Wed 10:00" — distinct weekly times, weekdays grouped per start time. */
export function slotsLabel(slots: Array<{ weekday: number; time: string }>): string | null {
  const byTime = new Map<string, Set<number>>();
  for (const s of slots) (byTime.get(s.time) ?? byTime.set(s.time, new Set()).get(s.time)!).add(s.weekday);
  const order = (d: number) => (d + 6) % 7;
  const parts = [...byTime.entries()]
    .map(([time, days]) => ({ time, days: [...days].sort((a, b) => order(a) - order(b)) }))
    .sort((a, b) => order(a.days[0]) - order(b.days[0]) || a.time.localeCompare(b.time))
    .map((p) => `${p.days.map((d) => DAY_ABBR[d]).join(", ")} ${p.time}`);
  return parts.length ? parts.slice(0, 2).join(" · ") : null;
}

/** Teaching week of a date, from the academic calendar (never date arithmetic). */
export const teachingWeek = (at: Date) => calendarWeekOf(localDay(at))?.week ?? null;

/* ───────────── semester calendar (LMS phases) ───────────── */

export type SemesterPhaseView = {
  semesterId: string;
  /** "Spring 2027", when the LMS named the semester. */
  semester: string | null;
  kind: LmsSemesterPhase["kind"];
  /** "Cohort selection", "Schedule builder", "Add/drop", "Classes start". */
  title: string;
  /** ISO date-times and Tashkent days (YYYY-MM-DD). */
  starts: string;
  ends: string;
  startDay: string;
  endDay: string;
};

export const PHASE_TITLE: Record<LmsSemesterPhase["kind"], string> = {
  "cohort-selection": "Cohort selection", "schedule-builder": "Schedule builder", "add-drop": "Add/drop", studies: "Classes start", other: "",
};

/** Every stored semester-calendar phase that has not ended by `today`, soonest first. Postgres only. */
export async function semesterPhases(today: string): Promise<SemesterPhaseView[]> {
  const rows = await db().select({ id: lmsSemesters.id, name: lmsSemesters.name, calendar: lmsSemesters.calendar }).from(lmsSemesters).where(isNotNull(lmsSemesters.calendar));
  return rows
    .flatMap((r) => (r.calendar ?? []).map((p) => ({
      semesterId: r.id, semester: r.name ? termName(r.name) || r.name : null, kind: p.kind, title: PHASE_TITLE[p.kind] || p.name,
      starts: p.starts, ends: p.ends, startDay: localDay(new Date(p.starts)), endDay: localDay(new Date(p.ends)),
    })))
    .filter((p) => p.endDay >= today)
    .sort((a, b) => a.starts.localeCompare(b.starts));
}

/* ───────────── ratings (public, cached) ───────────── */

export type RatingSummaryView = CourseSummary & { hoursLabel: string | null; difficultyLabel: string | null; since: string | null; until: string | null };

async function courseRatingRows(codes: string[]) {
  if (!codes.length) return [];
  const code = sql<string>`coalesce(${courseRatings.courseCode}, ${lmsCourses.code})`;
  return db()
    .select({ code, term: courseRatings.term, recommend: courseRatings.recommend, hours: courseRatings.hours, difficulty: courseRatings.difficulty, tags: courseRatings.tags })
    .from(courseRatings)
    .leftJoin(lmsCourses, eq(lmsCourses.id, courseRatings.courseId))
    .where(or(inArray(courseRatings.courseCode, codes), inArray(lmsCourses.code, codes)));
}

const DIFFICULTY_WORDS = (d: number | null) => (d === null ? null : d < 2 ? "Easy" : d < 2.8 ? "Manageable" : d < 3.6 ? "Hard-ish" : d < 4.4 ? "Hard" : "Very hard");

/** Rating summaries by course code; numbers only from 5 ratings (core MIN_RATINGS). */
export const ratingsByCode = publicCache(
  "ratings-by-code",
  async (codes: string[]): Promise<Record<string, RatingSummaryView>> => {
    const rows = await courseRatingRows(codes);
    const out: Record<string, RatingSummaryView> = {};
    for (const code of codes) {
      const mine: StoredRating[] = rows
        .filter((r) => r.code === code)
        .map((r) => ({ courseId: code, term: r.term, recommend: r.recommend, hours: toHours(r.hours), difficulty: (r.difficulty as StoredRating["difficulty"]) ?? null, tags: r.tags as StoredRating["tags"], teachers: [] }));
      const s = summarizeCourse(mine);
      const terms = s.enough ? s.trend.map((t) => t.term) : [];
      out[code] = {
        ...s,
        hoursLabel: s.enough && s.hours !== null ? `≈ ${Math.round(s.hours)} h/wk` : null,
        difficultyLabel: s.enough ? DIFFICULTY_WORDS(s.difficulty) : null,
        since: terms[0] ?? null,
        until: terms.at(-1) ?? null,
      };
    }
    return out;
  },
  (codes) => [TAGS.ratings, ...codes.map(TAGS.course)],
);

export const recommendOf = (s: RatingSummaryView | undefined) => (s?.enough ? s.recommendPct : null);

/** Teacher summaries ("% pressed F"), by course code in `byCourse`. */
export const teacherSummaries = publicCache(
  "teacher-summaries",
  async (ids: string[]): Promise<Record<string, TeacherSummary>> => {
    if (!ids.length) return {};
    const code = sql<string>`coalesce(${courseRatings.courseCode}, ${lmsCourses.code}, ${courseRatings.courseId})`;
    const rows = await db()
      .select({ teacherId: teacherRatings.teacherId, role: teacherRatings.role, pressF: teacherRatings.pressF, tags: teacherRatings.tags, term: courseRatings.term, code })
      .from(teacherRatings)
      .innerJoin(courseRatings, eq(courseRatings.id, teacherRatings.ratingId))
      .leftJoin(lmsCourses, eq(lmsCourses.id, courseRatings.courseId))
      .where(inArray(teacherRatings.teacherId, ids));
    const out: Record<string, TeacherSummary> = {};
    for (const id of ids) {
      const stored: StoredRating[] = rows
        .filter((r) => r.teacherId === id)
        .map((r) => ({ courseId: r.code, term: r.term, recommend: "yes", hours: null, difficulty: null, tags: [], teachers: [{ teacherId: id, role: r.role as TeacherRole, pressF: r.pressF, tags: r.tags as StoredRating["teachers"][number]["tags"] }] }));
      out[id] = summarizeTeacher(id, stored);
    }
    return out;
  },
  (ids) => [TAGS.ratings, ...ids.map(TAGS.teacher)],
);

/* ───────────── Anonymous mentions (public) ───────────── */

export type MentionView = { id: number; url: string; text: string; date: string | null };
export type MentionsView = { count: number; latest: MentionView[] };

/** Posts hidden by a moderator or under a live mute are left out (count included). */
export async function mentionsOf(kind: "course" | "teacher", target: string, limit = 3): Promise<MentionsView> {
  const where = and(eq(mentionLinks.kind, kind), eq(mentionLinks.target, target), postVisible(mentionLinks.postId));
  const [rows, [{ n }]] = await Promise.all([
    db().select({ id: mentions.postId, url: mentions.url, text: mentions.text, date: mentions.date }).from(mentions).innerJoin(mentionLinks, eq(mentionLinks.postId, mentions.postId)).where(where).orderBy(desc(mentions.postId)).limit(limit),
    db().select({ n: count() }).from(mentionLinks).where(where),
  ]);
  return { count: n, latest: rows.map((r) => ({ ...r, date: r.date?.toISOString() ?? null })) };
}

/* ───────────── files ───────────── */

export type FileItem = {
  id: string;
  source: "lms" | "students";
  title: string;
  type: FileType;
  typeLabel: string;
  format: FileFormat;
  formatCode: string;
  week: number | null;
  /** When it was posted: the LMS upload date for LMS files, the upload time for student files. ISO. */
  date: string;
  dateLabel: string;
  /** "LMS" or "From students" (or the uploader's name when they chose to show it). */
  from: string;
  lessonId: string | null;
  size: number | null;
  /** PDF page count, when known (LMS files). Always set by the server; optional for fixtures. */
  pages?: number | null;
  /** The LMS course id (one per semester the code ran) the file belongs to, when known: a term's page shows its own files. */
  courseId?: string | null;
  href: string;
};

type LmsFileRow = typeof lmsFiles.$inferSelect;
type UploadRow = typeof uploads.$inferSelect;

/** The date an LMS file was posted: its LMS upload date, else its last LMS change, else when we pulled it. */
export const lmsFileDate = (f: Pick<LmsFileRow, "lmsCreatedAt" | "lmsUpdatedAt" | "fetchedAt">) => f.lmsCreatedAt ?? f.lmsUpdatedAt ?? f.fetchedAt;

/** Course code → its teachers' names, to keep "Sejuti Rahman" / "SR" out of file titles. */
export const teacherNamesByCode = publicCache(
  "teacher-names-by-code",
  async (): Promise<Record<string, string[]>> => {
    const rows = await db()
      .select({ code: lmsCourses.code, firstName: lmsTeachers.firstName, lastName: lmsTeachers.lastName, surName: lmsTeachers.surName })
      .from(lmsCourseTeachers)
      .innerJoin(lmsCourses, eq(lmsCourses.id, lmsCourseTeachers.courseId))
      .innerJoin(lmsTeachers, eq(lmsTeachers.id, lmsCourseTeachers.teacherId));
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      if (!r.code) continue;
      const name = teacherName(r);
      if (name !== "Teacher" && !(out[r.code] ??= []).includes(name)) out[r.code].push(name);
    }
    return out;
  },
  () => [TAGS.catalog],
);

export function lmsFileItem(f: LmsFileRow, course: { code: string; name: string; teachers?: string[] }, lessonWeek: Map<string, number | null>): FileItem {
  const meta = describeFile(f.name, { courseCode: course.code, courseName: course.name, extension: f.extension ?? undefined, teachers: course.teachers });
  const date = lmsFileDate(f);
  return {
    id: f.id, source: "lms", title: meta.title, type: meta.type, typeLabel: TYPE_LABEL[meta.type], format: meta.format, formatCode: FORMAT_CODE[meta.format],
    week: meta.week ?? (f.lessonId ? lessonWeek.get(f.lessonId) ?? null : null), date: date.toISOString(), dateLabel: shortDate(date),
    from: "LMS", lessonId: f.lessonId, size: f.size, pages: f.pages, courseId: f.courseId ?? null, href: `/f/${f.id}`,
  };
}

export function uploadItem(u: UploadRow): FileItem {
  const type = (u.type as FileType) ?? "other";
  const meta = describeFile(u.fileName);
  return {
    id: u.id, source: "students", title: u.title, type, typeLabel: TYPE_LABEL[type] ?? "File", format: meta.format, formatCode: FORMAT_CODE[meta.format],
    week: u.week, date: u.createdAt.toISOString(), dateLabel: shortDate(u.createdAt), from: shownAs(u.showName, null), lessonId: null, size: u.size, pages: null, courseId: u.courseId ?? null, href: `/f/${u.id}`,
  };
}

/** Lesson id → teaching week, from the lesson's first scheduled date. */
export function lessonWeeks(raw: unknown): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const s of lessonSlots(raw).sort((a, b) => a.at.localeCompare(b.at))) {
    if (!map.has(s.lessonId)) map.set(s.lessonId, teachingWeek(new Date(s.at)));
  }
  return map;
}

/** All files of a course code: LMS files and live student uploads (signed-in only; cached per code). */
export const courseFiles = publicCache(
  "course-files",
  async (code: string): Promise<FileItem[]> => {
    const [courses, lms, live, overrides, people] = await Promise.all([
      db().select({ id: lmsCourses.id, name: lmsCourses.name, raw: lmsCourses.raw }).from(lmsCourses).where(eq(lmsCourses.code, code)),
      db().select().from(lmsFiles).where(eq(lmsFiles.code, code)),
      db().select().from(uploads).where(and(eq(uploads.status, "live"), or(eq(uploads.courseCode, code), inArray(uploads.courseId, db().select({ id: lmsCourses.id }).from(lmsCourses).where(eq(lmsCourses.code, code)))))),
      fileOverridesMap(),
      teacherNamesByCode(),
    ]);
    const name = courses[0]?.name ?? code;
    const weeks = new Map<string, number | null>();
    for (const c of courses) for (const [k, v] of lessonWeeks(c.raw)) weeks.set(k, v);
    // Admin edits (rename, type, week) apply on top; hidden LMS files drop out.
    const items = [...overlayAll(lms.map((f) => lmsFileItem(f, { code, name, teachers: people[code] }, weeks)), overrides), ...live.map(uploadItem)];
    return items.sort((a, b) => (a.week ?? 99) - (b.week ?? 99) || a.date.localeCompare(b.date));
  },
  (code) => [TAGS.files(code), TAGS.course(code), DECISION_TAGS.overrides],
);

/* ───────────── feed ───────────── */

export type FeedView = {
  id: string;
  kind: FeedKind;
  title: string;
  body: string | null;
  courseId: string | null;
  courseName: string | null;
  /** Who posted it (LMS announcements), "Gonçalo Pinto". Always set by the server; optional for fixtures. */
  author?: string | null;
  /** The source line for LMS announcements: "LMS · Calculus 1 · Gonçalo Pinto" (null for other kinds). Always set by the server. */
  byline?: string | null;
  at: string;
  ago: string;
  read: boolean;
  /** The LMS asks the student to confirm it and they haven't opened it yet (opening confirms it). */
  needsAck: boolean;
  /** The LMS asked for a confirmation and the student gave it by opening it ("Acknowledged"). Optional for fixtures. */
  acknowledged?: boolean;
  href: string | null;
  /**
   * New-files items (kind "file"): the files themselves, at most three, each
   * opening the file, plus how many more there are. Null for other kinds or
   * when the files are no longer known. Always set by the server; optional for fixtures.
   */
  files?: FeedFiles | null;
  /** Grade items: what was graded, the score, its maximum when known and its tier. Optional for fixtures. */
  grade?: GradeMark | null;
  /** Attendance items: the class, its mark and the absences left (now), with a tone. Optional for fixtures. */
  attendance?: AttendanceMark | null;
};

export type FeedFile = { id: string; title: string; type: FileType; typeLabel: string; href: string };
export type FeedFiles = { count: number; shown: FeedFile[]; more: number; courseHref: string | null };

/** "LMS · System notification" says nothing: the LMS's placeholder sender is no author. */
const realAuthor = (a: string | null | undefined) => (a && !/^system\s+notification$/i.test(a.trim()) ? a : null);

/**
 * Items stored before the "new files" wording changed read
 * "10 new files: A, B, C, …" with "Course · Week 8" below; they are shown as
 * "10 new files in Course" with "Week 8 · A, B, C and 7 more" below.
 */
function fileWording(i: FeedItem, courseName: string | null): { title: string; body: string | null } {
  const old = i.kind === "file" && courseName ? i.title.match(/^(\d+) new files?: ([\s\S]*)$/) : null;
  if (!old) return { title: i.title, body: i.body ?? null };
  const count = Number(old[1]);
  const week = i.body?.match(/Week \d+/)?.[0] ?? null;
  if (count === 1) return { title: `New file in ${courseName}: ${old[2]}`, body: week };
  return { title: `${count} new files in ${courseName}`, body: [week, fileList(old[2].split(", "))].filter(Boolean).join(" · ") };
}

/**
 * Grade and attendance items name the course in the title ("New grade in
 * Calculus 1", "Marked absent in Calculus 1"); what was graded or which class,
 * the mark and the absences left show under it, so the old body line goes.
 */
function markWording(courseName: string, grade: GradeMark | null, att: AttendanceMark | null): { title: string; body: null } | null {
  if (grade) return { title: `New grade in ${courseName}`, body: null };
  if (!att) return null;
  if (att.kind === "limit") return { title: att.status === "over" ? `Over the absence limit in ${courseName}` : `Careful: ${(att.line ?? "few absences left").toLowerCase()} in ${courseName}`, body: null };
  const mark = att.mark ?? "absent";
  return { title: mark === "excused" ? `Excused absence in ${courseName}` : `Marked ${MARK_LABEL[mark].toLowerCase()} in ${courseName}`, body: null };
}

export function feedView(i: FeedItem, now: Date, names: Map<string, CourseRef>, known?: Map<string, FileItem>, gradebook?: Map<string, GradebookCourse>): FeedView {
  const courseName = (i.courseId ? names.get(i.courseId)?.name : null) ?? i.courseName ?? null;
  const author = realAuthor(i.author);
  const files = known ? feedFiles(i, known) : null;
  const grade = gradeMark(i);
  const attendance = attendanceMark(i, i.courseId ? gradebook?.get(i.courseId) : null);
  const marks = courseName ? markWording(courseName, grade, attendance) : null;
  // With the files listed under it, the item reads "3 new files in Deep Learning" with just the week below.
  const { title, body } = files && courseName
    ? { title: files.count === 1 ? `New file in ${courseName}` : `${files.count} new files in ${courseName}`, body: i.body?.match(/Week \d+/)?.[0] ?? null }
    : marks ?? fileWording(i, courseName);
  return {
    id: i.id, kind: i.kind, title, body, courseId: i.courseId ?? null, courseName, author,
    byline: i.kind === "announcement" ? ["LMS", courseName, author].filter(Boolean).join(" · ") : null,
    at: i.at.toISOString(), ago: ago(i.at, now), read: i.read, needsAck: !!i.needsAck && !i.read, acknowledged: !!i.needsAck && i.read, href: i.href ?? null,
    files, grade, attendance,
  };
}

/** The file ids a new-files item carries in its id: "files:<courseId>:<id>,<id>,…" (the last one may be cut short). */
export function feedFileIds(i: Pick<FeedItem, "id" | "kind">): string[] {
  const m = i.kind === "file" ? i.id.match(/^files:[^:]+:(.+)$/) : null;
  return m ? m[1].split(",").filter(Boolean) : [];
}

/** How many files a new-files item announced: from its title ("10 new files …"), else the ids it carries. */
function announcedCount(i: FeedItem, ids: number) {
  const n = i.title.match(/^(\d+) new files?\b/);
  if (n) return Math.max(Number(n[1]), ids);
  return /^New file\b/.test(i.title) ? Math.max(1, ids) : ids;
}

function feedFiles(i: FeedItem, known: Map<string, FileItem>): FeedFiles | null {
  const ids = feedFileIds(i);
  const found = ids.map((id) => known.get(id)).filter((f): f is FileItem => !!f);
  if (!found.length) return null;
  const count = announcedCount(i, ids.length);
  const shown = found.slice(0, 3).map((f) => ({ id: f.id, title: f.title, type: f.type, typeLabel: f.typeLabel, href: f.href }));
  // "and 7 more" opens the course's Files tab.
  const courseHref = i.href && /^\/c\/[^/?#]+/.test(i.href) ? i.href.replace(/^(\/c\/[^/?#]+)(\/[^?#]*)?/, "$1/files") : null;
  return { count, shown, more: Math.max(0, count - shown.length), courseHref };
}

/**
 * Feed rows ready to show: new-files items get their files (one query for the
 * whole list, admin edits applied); attendance items read `gradebook` (the
 * student's synced courses) for the class time, the mark and the absences left now.
 */
export async function feedViews(items: FeedItem[], now: Date, names: Map<string, CourseRef>, gradebook: GradebookCourse[] = []): Promise<FeedView[]> {
  const ids = [...new Set(items.flatMap(feedFileIds))];
  const known = new Map<string, FileItem>();
  if (ids.length) {
    const [rows, overrides, people] = await Promise.all([db().select().from(lmsFiles).where(inArray(lmsFiles.id, ids)), fileOverridesMap(), teacherNamesByCode()]);
    const list = rows.map((f) => lmsFileItem(f, { code: f.code ?? "", name: (f.courseId ? names.get(f.courseId)?.name : null) ?? f.code ?? "", teachers: people[f.code ?? ""] }, new Map()));
    for (const f of overlayAll(list, overrides)) known.set(f.id, f);
  }
  const courses = new Map(gradebook.map((c) => [c.subjectId, c]));
  return items.map((i) => feedView(i, now, names, known, courses));
}

/* ───────────── deadlines ───────────── */

export const STATUS_LABEL: Record<DeadlineStatus, string> = {
  todo: "Not submitted", "in-progress": "In progress", submitted: "Under review", checked: "Checked", missed: "Missed", archived: "Archived",
};

export type DeadlineView = { id: string; course: string; title: string; due: string; dueLabel: string; until: string; status: DeadlineStatus; statusLabel: string; grade: number | null };

export const deadlineView = (d: Deadline, now: Date): DeadlineView => ({
  id: d.id, course: d.course, title: d.title, due: d.due.toISOString(), dueLabel: whenLabel(d.due, now), until: until(d.due, now),
  status: d.status, statusLabel: STATUS_LABEL[d.status], grade: d.grade,
});

export const deadlines = (list: LmsHomework[]) => list.map(deadline).filter((d): d is Deadline => !!d);

/** Course name matching between the gradebook / homework (names) and the catalog. */
export const sameCourse = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

export { toLocal };
