import { and, eq, inArray, sql } from "drizzle-orm";
import { roleOf } from "@/core/people";
import type { RatingInput, TagShare, TeacherRole, TeacherTag } from "@/core/ratings";
import { dayInfo, termMatches } from "@/core/semester";
import { getCatalog } from "@/lib/catalog";
import { courseDetails, resolveRequirement, unlocks } from "@/lib/content";
import { db } from "@/lib/db";
import { lmsCourseTeachers, lmsCourses, lmsFiles, lmsSemesters, uploads, userState } from "@/lib/db/schema";
import { termName } from "@/server/sync/types";
import { describeFile, downloadName, FORMAT_CODE, TYPE_LABEL, type FileFormat, type FileType } from "@/core/files";
import { shownAs } from "@/core/uploads";
import { signedUrl } from "@/lib/storage";
import { shortDate } from "@/core/time";
import { DECISION_TAGS, fileOverride, overlay } from "@/server/decisions";
import { publicCache, TAGS } from "./cache";
import { nextSemesterEntry, type NextSemesterEntry } from "./curriculum";
import { progressCourses, type AbsencesView, type ProgressCourse } from "./progress";
import { myRatingFor, rateQueueFor } from "./rate";
import {
  courseFiles, lessonSlots, lmsFileDate, mentionsOf, ratingsByCode, recommendOf, ROLE_LABEL, slotsLabel, teacherSummaries, teachersByIds,
  type FileItem, type MentionsView, type RatingSummaryView, type DeadlineView,
} from "./shared";
import { loadStudent, type Student, type SyncState } from "./student";
import type { CourseCard } from "./today";

/** Courses: My courses (4.1, 4.16), the course page (4.2–4.8, 4.18) and a file (4.9). */

export type Viewer = { userId: string } | null;

/* ───────────── my courses ───────────── */

export type MyCoursesView = {
  sync: SyncState;
  term: string | null;
  courses: CourseCard[];
  /** The registrar has not published the new semester in the LMS yet (Figma 4.16). */
  notInLmsYet: boolean;
  earlier: Array<{ term: string; courses: number; ects: number | null }>;
  /** The Next semester strip (Figma 4.1). */
  next?: NextSemesterEntry;
};

export async function courseCards(student: Student, courses: ProgressCourse[]): Promise<CourseCard[]> {
  const weekly = student.cache?.timetable ?? [];
  const codes = [...new Set(courses.map((c) => c.code).filter(Boolean))];
  const [ratings, people] = await Promise.all([ratingsByCode(codes), teachersByIds(weekly.map((l) => l.teacher ?? "").filter(Boolean))]);
  return courses.map((c) => {
    const lessons = weekly.filter((l) => l.code === c.code);
    const tid = lessons.find((l) => l.teacher)?.teacher ?? null;
    const t = tid ? people.get(tid) : undefined;
    const slots = slotsLabel(lessons.map((l) => ({ weekday: (l.day + 1) % 7, time: l.starts })));
    const room = lessons.find((l) => l.room)?.room;
    return {
      courseId: c.courseId, code: c.code, name: c.name, recommendPct: recommendOf(ratings[c.code]), teacher: t ? { id: t.id, name: t.name, face: t.face } : null,
      when: slots ? `${slots}${room ? ` · ${room}` : ""}` : null, mark: c.mark, href: c.code ? `/c/${c.code}` : c.href,
    };
  });
}

export async function myCourses(userId: string, now = new Date()): Promise<MyCoursesView | null> {
  const student = await loadStudent(userId);
  if (!student) return null;
  const courses = await progressCourses(student, now);
  const past = student.sync.semesters.filter((s) => !s.open).sort((a, b) => Number(b.id) - Number(a.id));
  const pastIds = student.sync.courses.filter((c) => past.some((s) => s.id === c.semesterId)).map((c) => c.subjectId);
  const [cards, credits, next] = await Promise.all([
    courseCards(student, courses),
    pastIds.length ? db().select({ id: lmsCourses.id, credits: lmsCourses.credits }).from(lmsCourses).where(inArray(lmsCourses.id, pastIds)) : Promise.resolve([]),
    nextSemesterEntry(student, now),
  ]);
  const creditOf = new Map(credits.map((c) => [c.id, c.credits]));
  const open = student.sync.semesters.find((s) => s.open);
  return {
    sync: student.state,
    term: open?.term ?? (student.cache?.enrollment?.semesterName ? termName(student.cache.enrollment.semesterName) : null),
    courses: cards,
    notInLmsYet: cards.length === 0 && (student.sync.semesters.length > 0 || !!student.cache),
    earlier: past.map((s) => {
      const ids = student.sync.courses.filter((c) => c.semesterId === s.id).map((c) => c.subjectId);
      const sum = ids.reduce((n, id) => n + (creditOf.get(id) ?? 0), 0);
      return { term: s.term, courses: ids.length, ects: sum || null };
    }),
    next,
  };
}

/* ───────────── course page ───────────── */

export type TeacherCard = {
  id: string;
  name: string;
  role: TeacherRole;
  roleLabel: string;
  /** "% pressed F" for this course and role, from 5 ratings; else overall; else null. */
  pressFPct: number | null;
  ratings: number;
  when: string | null;
  topTag: TeacherTag | null;
  /** Drawn face URL, null when none is assigned. Always set by the server. */
  face?: string | null;
  href: string;
};

export type TermOption = { courseId: string; semesterId: string | null; term: string; teachers: string[]; current: boolean };

export type SyllabusFold = {
  grading: Array<{ name: string; weight: number | null; timing: string | null }>;
  ects: number | null;
  totalHours: number | null;
  hoursPerWeek: number | null;
  outcomes: string[];
  books: Array<{ title: string; authors: string; kind: "required" | "recommended" }>;
  prerequisites: { status: "listed" | "none" | "not_stated"; needs: Array<{ text: string; code: string | null }>; unlocks: Array<{ code: string; name: string }> };
  description: string | null;
  attendancePolicy: string | null;
};

export type WeekView = { week: number | null; topic: string | null; current: boolean; files: FileItem[] };

export type YouInCourse =
  | { status: "now"; courseId: string; mark: number | null; average: number | null; rating: number | null; absences: AbsencesView | null; next: DeadlineView | null }
  | { status: "took"; courseId: string; term: string; mark: number | null; passed: boolean | null; ects: number | null; teacher: string | null };

export type CourseView = {
  code: string;
  name: string;
  /** The LMS subject id of the selected semester. */
  courseId: string;
  term: TermOption | null;
  terms: TermOption[];
  /** "Now" / "You took it" next to the term. */
  termStatus: "now" | "took" | null;
  signedIn: boolean;
  ratings: RatingSummaryView;
  teachers: TeacherCard[];
  anonymous: MentionsView;
  /** Signed-in only; null for guests (Figma 4.6). */
  weeks: WeekView[] | null;
  totalWeeks: number;
  files: { all: number; byType: Partial<Record<FileType, number>>; items: FileItem[] } | null;
  syllabus: SyllabusFold | null;
  you: YouInCourse | null;
  /** `answers`: the student's saved rating for this course, to prefill "Edit your rating" (null when not rated). */
  rate: {
    canRate: boolean;
    rated: boolean;
    term: string | null;
    href: string;
    answers?: RatingInput | null;
    /** This semester's course before its rating window: the teaching week it opens in ("Opens in week 14"). Always set by the server. */
    opensIn?: number | null;
  } | null;
  /** This week of the teaching calendar; another semester's weeks open at the same point (Figma 4.4). */
  teachingWeek?: number | null;
  /** The viewer's current courses (same cards as myCourses()), for the desktop list pane (D4). Null for guests. */
  myCourses?: CourseCard[] | null;
};

/** LMS semester id → "Fall 2026", learned from students' gradebooks as they sync. */
export const semesterNames = publicCache(
  "semester-names",
  async (): Promise<Record<string, string>> => {
    const [rows, named] = await Promise.all([
      db().execute<{ id: string; term: string }>(
        sql`select distinct s->>'id' as id, s->>'term' as term from ${userState}, jsonb_array_elements(coalesce(${userState.snapshot}->'lms'->'semesters', '[]'::jsonb)) as s`,
      ),
      db().select({ id: lmsSemesters.id, name: lmsSemesters.name }).from(lmsSemesters),
    ]);
    // The harvested semester list wins; students' gradebook names fill any gap.
    const fromStudents = rows.rows.filter((r) => r.id && r.term && !/^Semester \d+$/.test(r.term)).map((r) => [r.id, r.term] as const);
    const fromLms = named.filter((r) => r.name).map((r) => [r.id, termName(r.name) || r.name!] as const);
    return Object.fromEntries([...fromStudents, ...fromLms]);
  },
  () => [TAGS.catalog],
);

type CoursePublic = Omit<CourseView, "courseId" | "term" | "termStatus" | "signedIn" | "you" | "rate" | "weeks" | "files" | "syllabus" | "teachers"> & {
  rows: Array<{ id: string; semesterId: string | null; credits: number | null }>;
  teachersByCourse: Record<string, TeacherCard[]>;
  syllabus: SyllabusFold | null;
  topics: Record<string, string>;
};

const coursePublic = publicCache(
  "course-public",
  async (code: string): Promise<CoursePublic | null> => {
    const rows = await db().select().from(lmsCourses).where(eq(lmsCourses.code, code));
    if (!rows.length) return null;
    const ids = rows.map((r) => r.id);
    const [links, ratings, names, details, anonymous, catalog] = await Promise.all([
      db().select().from(lmsCourseTeachers).where(inArray(lmsCourseTeachers.courseId, ids)),
      ratingsByCode([code]),
      semesterNames(),
      courseDetails(code),
      mentionsOf("course", code),
      getCatalog(),
    ]);
    const teacherIds = [...new Set(links.map((l) => l.teacherId))];
    const [people, summaries, unlocked] = await Promise.all([teachersByIds(teacherIds), teacherSummaries(teacherIds), unlocks(code, catalog)]);

    const teachersByCourse: Record<string, TeacherCard[]> = {};
    for (const r of rows) {
      const slots = lessonSlots(r.raw);
      const seen = new Set<string>();
      const cards: TeacherCard[] = [];
      for (const l of links.filter((x) => x.courseId === r.id)) {
        const role = roleOf(l.role);
        if (seen.has(`${l.teacherId}|${role}`)) continue;
        seen.add(`${l.teacherId}|${role}`);
        const s = summaries[l.teacherId];
        const forCourse = s?.enough ? s.byCourse.find((b) => b.courseId === code && b.role === role) : undefined;
        cards.push({
          id: l.teacherId, name: people.get(l.teacherId)?.name ?? "Teacher", role, roleLabel: ROLE_LABEL[role],
          pressFPct: forCourse?.pct ?? (s?.enough ? s.pressFPct : null), ratings: s?.count ?? 0,
          when: slotsLabel(slots.filter((x) => x.teacherId === l.teacherId)), topTag: (s?.enough ? (s.tags[0] as TagShare<TeacherTag> | undefined)?.tag : null) ?? null,
          face: people.get(l.teacherId)?.face ?? null,
          href: `/p/${l.teacherId}`,
        });
      }
      const order: TeacherRole[] = ["lecture", "tutorial", "practice", "lab", "other"];
      teachersByCourse[r.id] = cards.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
    }

    const terms: TermOption[] = rows
      .map((r) => ({ courseId: r.id, semesterId: r.semesterId, term: (r.semesterId && names[r.semesterId]) || (r.semesterId ? `Semester ${r.semesterId}` : "Current"), teachers: (teachersByCourse[r.id] ?? []).map((t) => t.name), current: false }))
      .sort((a, b) => Number(b.semesterId ?? 0) - Number(a.semesterId ?? 0));
    if (terms[0]) terms[0].current = true;

    const d = details?.data ?? null;
    const syllabus: SyllabusFold | null = d
      ? {
          grading: d.assessment.map((a) => ({ name: a.name, weight: a.weight_percent, timing: a.timing || null })),
          ects: d.ects, totalHours: d.total_hours,
          hoursPerWeek: d.total_hours ? Math.round(d.total_hours / 15) : null,
          outcomes: d.learning_outcomes,
          books: d.books.map((b) => ({ title: b.title, authors: b.authors, kind: b.kind })),
          prerequisites: {
            status: d.prerequisites.status,
            needs: d.prerequisites.groups.flatMap((g) => g.any_of).map((i) => resolveRequirement(i, catalog.courses)),
            unlocks: unlocked.map((c) => ({ code: c.code, name: c.subject })),
          },
          description: d.description || null,
          attendancePolicy: d.attendance_policy || null,
        }
      : null;
    const topics: Record<string, string> = {};
    for (const t of d?.topics_by_week ?? []) {
      const n = Number(t.week.match(/\d+/)?.[0]);
      if (n && !topics[n]) topics[n] = t.topic;
    }
    return {
      code, name: rows[0].name, rows: rows.map((r) => ({ id: r.id, semesterId: r.semesterId, credits: r.credits })),
      terms, ratings: ratings[code], anonymous, teachersByCourse, syllabus, topics, totalWeeks: 16,
    };
  },
  (code) => [TAGS.course(code), TAGS.ratings, TAGS.catalog, DECISION_TAGS.moderation],
);

/**
 * The course page. Public parts are cached per code; files, syllabus, weeks and
 * "you in this course" only for signed-in viewers, enforced here.
 */
export async function course(code: string, term: string | null, viewer: Viewer, now = new Date()): Promise<CourseView | null> {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [pub, student] = await Promise.all([coursePublic(clean), viewer ? loadStudent(viewer.userId) : Promise.resolve(null)]);
  if (!pub) return null;
  const signedIn = !!student;

  const mine = student ? student.sync.courses.filter((c) => pub.rows.some((r) => r.id === c.subjectId)) : [];
  const picked =
    (term ? pub.terms.find((t) => t.term === term || t.semesterId === term || t.courseId === term || termMatches(t.term, term)) : undefined) ??
    pub.terms.find((t) => mine.some((m) => m.subjectId === t.courseId)) ??
    pub.terms[0];
  const courseId = picked.courseId;

  const openIds = new Set(student?.sync.semesters.filter((s) => s.open).map((s) => s.id) ?? []);
  const taken = mine.find((m) => m.subjectId === courseId) ?? mine[0];
  const termStatus: CourseView["termStatus"] = taken && taken.subjectId === courseId ? (openIds.has(taken.semesterId) ? "now" : "took") : picked.current ? "now" : null;

  const [allFiles, progressRows, queue, rated] = await Promise.all([
    signedIn ? courseFiles(clean) : Promise.resolve(null),
    student ? progressCourses(student, now) : Promise.resolve([]),
    student && taken ? rateQueueFor(student, now) : Promise.resolve(null),
    viewer && taken ? myRatingFor(viewer.userId, pub.rows.map((r) => r.id)) : Promise.resolve(null),
  ]);

  // The picked term's files only: an earlier semester never shows this one's
  // weeks. Files with no known course (some student uploads) belong to the current run.
  const files = allFiles ? (pub.terms.length > 1 ? allFiles.filter((f) => (f.courseId ? f.courseId === courseId : picked.current)) : allFiles) : null;

  let you: YouInCourse | null = null;
  if (student && taken) {
    if (openIds.has(taken.semesterId)) {
      const p = progressRows.find((r) => r.courseId === taken.subjectId);
      you = { status: "now", courseId: taken.subjectId, mark: p?.mark ?? null, average: taken.average, rating: taken.rating, absences: p?.absences ?? null, next: p?.next ?? null };
    } else {
      const semester = student.sync.semesters.find((s) => s.id === taken.semesterId);
      you = {
        status: "took", courseId: taken.subjectId, term: semester?.term ?? "", mark: taken.final ?? taken.average, passed: taken.passed,
        ects: pub.rows.find((r) => r.id === taken.subjectId)?.credits ?? null,
        teacher: (pub.teachersByCourse[taken.subjectId] ?? []).find((t) => t.role === "lecture")?.name ?? null,
      };
    }
  }

  const currentWeek = dayInfo(now).week?.week ?? null;
  const weeks: WeekView[] | null = files
    ? [...new Set([...Array.from({ length: pub.totalWeeks }, (_, i) => i + 1), ...files.map((f) => f.week)])]
        .sort((a, b) => (a ?? 99) - (b ?? 99))
        .map((w) => ({ week: w, topic: w ? pub.topics[w] ?? null : null, current: picked.current && w === currentWeek, files: files.filter((f) => f.week === w) }))
        .filter((w) => w.week !== null || w.files.length)
    : null;
  const byType: Partial<Record<FileType, number>> = {};
  for (const f of files ?? []) byType[f.type] = (byType[f.type] ?? 0) + 1;

  const waitingHere = queue?.waiting.find((w) => pub.rows.some((r) => r.id === w.courseId));
  const list = student ? await courseCards(student, progressRows) : null;
  return {
    teachingWeek: currentWeek,
    myCourses: list,
    code: pub.code,
    name: pub.name,
    courseId,
    term: picked,
    terms: pub.terms,
    termStatus,
    signedIn,
    ratings: pub.ratings,
    teachers: pub.teachersByCourse[courseId] ?? [],
    anonymous: pub.anonymous,
    weeks,
    totalWeeks: pub.totalWeeks,
    files: files ? { all: files.length, byType, items: files } : null,
    syllabus: signedIn ? pub.syllabus : null,
    you,
    rate: !taken || !you
      ? null
      : you.status === "took"
        ? { canRate: !!waitingHere || !!rated, rated: !!rated, term: waitingHere?.term ?? rated?.term ?? you.term, href: `/rate/${taken.subjectId}`, answers: rated?.answers ?? null, opensIn: null }
        : nowRate(taken.subjectId, rated, queue),
  };
}

/**
 * Rating this semester's course (Figma 4.2): open from the last 3 teaching weeks;
 * before that, disabled with "Opens in week 14". Only a rating of this very
 * course this term counts as "rated" (an earlier take of the same code doesn't).
 */
function nowRate(courseId: string, mine: Awaited<ReturnType<typeof myRatingFor>>, queue: Awaited<ReturnType<typeof rateQueueFor>> | null): NonNullable<CourseView["rate"]> {
  const rated = mine && mine.courseId === courseId && mine.term === queue?.currentTerm ? mine : null;
  return {
    canRate: !!rated || !!queue?.current?.some((c) => c.courseId === courseId),
    rated: !!rated,
    term: rated?.term ?? queue?.currentTerm ?? null,
    href: `/rate/${courseId}`,
    answers: rated?.answers ?? null,
    opensIn: rated ? null : (queue?.window?.opensIn ?? null),
  };
}

/* ───────────── file ───────────── */

export type FileView =
  | { locked: true; id: string; course: { code: string; name: string } | null }
  | {
      locked: false;
      id: string;
      source: "lms" | "students";
      title: string;
      course: { code: string; name: string };
      week: number | null;
      type: FileType;
      typeLabel: string;
      format: FileFormat;
      formatCode: string;
      from: string;
      date: string;
      dateLabel: string;
      size: number | null;
      /** PDF page count (LMS files), null when unknown. */
      pages?: number | null;
      /** The course's lecturer, for the course detail next to the file (D12). Always set by the server. */
      teacher?: { id: string; name: string; face: string | null } | null;
      /** Other files of the same course and week (D12). Always set by the server. */
      sameWeek?: FileItem[];
      /** The viewer's current courses, for the desktop list pane left of the file (D12). Always set by the server. */
      myCourses?: CourseCard[] | null;
      /** The file's course as on its own page, for the detail pane next to the file (D12). Always set by the server. */
      courseDetail?: CourseView | null;
      mimeType: string | null;
      downloadName: string;
      /** Signed bucket URL (1 h), null when storage is not configured. */
      url: string | null;
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sign(key: string | null, name: string) {
  if (!key) return null;
  try {
    return await signedUrl(key, name);
  } catch {
    return null;
  }
}

/** D12 beside a file: the course's lecturer and the other files of the same week (signed-in only). */
async function fileContext(code: string, courseId: string, week: number | null, id: string) {
  const [links, files] = await Promise.all([
    db().select().from(lmsCourseTeachers).where(eq(lmsCourseTeachers.courseId, courseId)),
    code ? courseFiles(code) : Promise.resolve([] as FileItem[]),
  ]);
  const lead = links.find((l) => roleOf(l.role) === "lecture") ?? links[0];
  const t = lead ? (await teachersByIds([lead.teacherId])).get(lead.teacherId) : undefined;
  return {
    teacher: t ? { id: t.id, name: t.name, face: t.face } : null,
    sameWeek: week === null ? [] : files.filter((x) => x.week === week && x.id !== id),
  };
}

/** D12 beside a file: the course as on its page (with the viewer's course list), signed-in only. */
async function fileCourse(code: string, viewer: Viewer) {
  const detail = code ? await course(code, null, viewer).catch(() => null) : null;
  return { courseDetail: detail, myCourses: detail?.myCourses ?? null };
}

/** Figma 4.9. Files are for signed-in students only; guests get `locked`. */
export async function file(id: string, viewer: Viewer): Promise<FileView | null> {
  if (UUID.test(id)) {
    const [u] = await db().select().from(uploads).where(and(eq(uploads.id, id)));
    if (!u || (u.status !== "live" && u.uploaderId !== viewer?.userId)) return null;
    const [c] = u.courseCode ? await db().select({ name: lmsCourses.name }).from(lmsCourses).where(eq(lmsCourses.code, u.courseCode)).limit(1) : [];
    const course = { code: u.courseCode ?? "", name: c?.name ?? u.courseCode ?? "" };
    if (!viewer) return { locked: true, id, course };
    const meta = describeFile(u.fileName);
    const type = (u.type as FileType) ?? "other";
    const ext = meta.format === "other" ? "" : u.fileName.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? "";
    const name = downloadName(u.title, course.name, meta.format, ext);
    const [url, ctx, around] = await Promise.all([sign(u.storageKey, name), fileContext(course.code, u.courseId, u.week, id), fileCourse(course.code, viewer)]);
    return {
      ...ctx,
      ...around,
      locked: false, id, source: "students", title: u.title, course, week: u.week, type, typeLabel: TYPE_LABEL[type] ?? "File", format: meta.format, formatCode: FORMAT_CODE[meta.format],
      from: shownAs(u.showName, null), date: u.createdAt.toISOString(), dateLabel: shortDate(u.createdAt), size: u.size, pages: null, mimeType: u.mimeType, downloadName: name, url,
    };
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const [[f], edit] = await Promise.all([db().select().from(lmsFiles).where(eq(lmsFiles.id, id)), fileOverride(id)]);
  if (!f || edit?.hidden) return null;
  const [c] = await db().select({ name: lmsCourses.name, raw: lmsCourses.raw }).from(lmsCourses).where(eq(lmsCourses.id, f.courseId));
  const course = { code: f.code, name: c?.name ?? f.code };
  if (!viewer) return { locked: true, id, course };
  const meta = describeFile(f.name, { courseCode: f.code, courseName: course.name, extension: f.extension ?? undefined });
  const lessonWeek = f.lessonId && c ? lessonSlots(c.raw).filter((s) => s.lessonId === f.lessonId).map((s) => dayInfo(new Date(s.at)).week?.week ?? null)[0] ?? null : null;
  const shown = overlay({ title: meta.title, type: meta.type, week: meta.week ?? lessonWeek }, edit)!;
  const name = downloadName(shown.title, course.name, meta.format, f.extension ?? "");
  const week = shown.week;
  const [url, ctx, around] = await Promise.all([sign(f.storageKey, name), fileContext(f.code, f.courseId, week, id), fileCourse(f.code, viewer)]);
  return {
    ...ctx,
    ...around,
    locked: false, id, source: "lms", title: shown.title, course, week, type: shown.type, typeLabel: TYPE_LABEL[shown.type], format: meta.format, formatCode: FORMAT_CODE[meta.format],
    from: "LMS", date: lmsFileDate(f).toISOString(), dateLabel: shortDate(lmsFileDate(f)), size: f.size, pages: f.pages, mimeType: f.mimeType, downloadName: name, url,
  };
}

