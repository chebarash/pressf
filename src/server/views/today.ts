import { inArray } from "drizzle-orm";
import { agenda, checkInOpen, firstAfter, type TodayState } from "@/core/agenda";
import { dueSoon } from "@/core/deadlines";
import { unreadCount } from "@/core/notifications";
import { dayInfo, nextPhase, type Phase } from "@/core/semester";
import { addDays, clock, localDay, localWeekday, shortDate, weekdayName } from "@/core/time";
import { db } from "@/lib/db";
import { lmsFiles } from "@/lib/db/schema";
import { fileOverridesMap, overlayAll } from "@/server/decisions";
import { feed } from "@/server/feed";
import { classesBetween, toBlocks, type ClassView } from "./classes";
import { progressCourses, type ProgressCourse } from "./progress";
import { rateQueueFor, type RateAsk } from "./rate";
import { courseCards } from "./courses";
import { coursesByIds, DAY_ABBR, deadlineView, feedViews, lmsFileItem, type DeadlineView, type FeedView, type FileItem } from "./shared";
import { loadStudent, type Student, type SyncState } from "./student";

/** Today (Figma 2.1–2.13, 10.1): the student's day in one read. */

export type Banner = {
  /** Stable while the content is the same, so "dismiss until it changes" works. */
  id: string;
  kind: "sign-in" | "lms-down" | "semester-start" | "exams" | "absences";
  text: string;
  action: { label: string; href: string | null };
};

export type ExamView = { key: string; courseId: string | null; name: string; kind: "midterm" | "final" | "exam"; start: string; dayLabel: string; time: string; room: string | null; label: string };

export type CourseCard = {
  courseId: string;
  code: string;
  name: string;
  /** "% recommend" from 5 ratings, else null. */
  recommendPct: number | null;
  /** `face`: drawn face URL, null when none is assigned. */
  teacher: { id: string; name: string; face?: string | null } | null;
  /** "Mon, Wed 10:00 · B-204". */
  when: string | null;
  mark: number | null;
  href: string;
};

export type PhaseView = { kind: Phase["kind"]; title: string; starts: string; ends: string; inDays: number; rangeLabel: string };

export type TodayView = {
  now: string;
  /** Given name for the greeting ("Good morning, Shamsiddin"), from the LMS profile. */
  firstName?: string | null;
  /** "Today", or the weekday on weekends ("Saturday"). */
  title: string;
  /** "Week 8 of 16", "Midterm exams", "Break · 21 Dec – 3 Jan". */
  weekLabel: string | null;
  state: TodayState;
  sync: SyncState;
  banner: Banner | null;
  tiles: {
    nextClass: string | null;
    absences: { left: number; courseId: string; name: string } | null;
    exam: { label: string; start: string } | null;
    courses: number;
    /** A class is running or starts within 5 minutes: show "Scan QR". */
    qrOpen: boolean;
  };
  classes: ClassView[];
  current: ClassView | null;
  next: ClassView | null;
  /** First class on a later day ("Tomorrow 10:00", "Monday 10:00") when today's are over or there are none. */
  upcoming: { label: string; class: ClassView } | null;
  /** Materials of the running or next class, from LMS lesson files. */
  materials: FileItem[];
  /** Break or exams period, for Figma 2.5. */
  phase: PhaseView | null;
  examsThisWeek: ExamView[];
  nextExams: ExamView[];
  rating: RateAsk;
  notifications: { unread: number; items: FeedView[] };
  dueSoon: DeadlineView[];
  courses: CourseCard[];
};

const examKind = (name: string, phase: Phase | null): ExamView["kind"] =>
  /final/i.test(name) || phase?.kind === "final" ? "final" : /mid/i.test(name) || phase?.kind === "midterm" ? "midterm" : "exam";

function examView(c: ClassView, now: Date, phase: Phase | null): ExamView {
  const kind = examKind(c.name, phase);
  const start = new Date(c.start);
  const days = Math.round((Date.parse(localDay(start)) - Date.parse(localDay(now))) / 86_400_000);
  return {
    key: c.key, courseId: c.courseId, name: c.name, kind, start: c.start, time: c.time, room: c.room,
    dayLabel: days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 7 ? weekdayName(start) : shortDate(start),
    label: `${c.name} ${kind === "exam" ? "exam" : kind}`,
  };
}

const range = (a: string, b: string) => {
  const [da, db_] = [shortDate(a), shortDate(b)];
  return a.slice(5, 7) === b.slice(5, 7) ? `${Number(a.slice(8, 10))}–${db_}` : `${da} – ${db_}`;
};

function banner(student: Student, now: Date, opts: { courses: ProgressCourse[]; classes: ClassView[]; exams: ExamView[]; term: string | null }): Banner | null {
  const s = student.state;
  if (s.signInAgain) return { id: "sign-in", kind: "sign-in", text: "Your LMS password changed, so syncing stopped. Sign in again to get new grades and files.", action: { label: "Sign in", href: "/sign-in" } };
  if (s.lmsDown && s.syncedAt) return { id: `lms-down:${s.syncedAt}`, kind: "lms-down", text: `LMS isn't answering. Showing what we had at ${clock(new Date(s.syncedAt))}.`, action: { label: "Retry", href: null } };
  const info = dayInfo(now);
  const today = opts.classes.filter((c) => localDay(new Date(c.start)) === info.day);
  if (info.week?.kind === "teaching" && info.week.week === 1 && info.week.starts === info.day && opts.term) {
    const first = today[0];
    const text = `${opts.term} starts today. ${opts.courses.length} courses${first ? `, first class ${first.time}${first.room ? ` in ${first.room}` : ""}` : ""}.`;
    return { id: `semester-start:${info.day}`, kind: "semester-start", text, action: { label: "Timetable", href: "/timetable" } };
  }
  const exams = nextPhase(now, ["midterm", "final"]);
  if (exams && exams.inDays > 0 && exams.inDays <= 7) {
    const word = exams.kind === "final" ? "Finals" : "Midterms";
    const inPhase = opts.exams.filter((e) => e.start.slice(0, 10) >= exams.starts);
    const list = inPhase.slice(0, 3).map((e) => `${e.name} on ${weekdayName(new Date(e.start))}`).join(", ");
    const startWord = exams.inDays <= 6 ? weekdayName(exams.starts) : shortDate(exams.starts);
    return { id: `exams:${exams.starts}:${inPhase.length}`, kind: "exams", text: `${word} start ${startWord}${list ? `: ${list}` : ""}.`, action: { label: "Exam plan", href: "/calendar" } };
  }
  const tight = opts.courses.filter((c) => c.absences && c.absences.left <= 2 && c.absences.status !== "over").sort((a, b) => a.absences!.left - b.absences!.left)[0];
  if (tight?.absences) {
    const left = tight.absences.left;
    const text = left === 0 ? `No absences left in ${tight.name}.` : `${left} ${left === 1 ? "absence" : "absences"} left in ${tight.name}.`;
    return { id: `absences:${tight.courseId}:${left}`, kind: "absences", text, action: { label: "See", href: tight.href } };
  }
  return null;
}

const givenName = (full: string | null | undefined) => {
  const first = full?.trim().split(/\s+/)[0];
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : null;
};

export async function today(userId: string, now = new Date()): Promise<TodayView | null> {
  const student = await loadStudent(userId);
  if (!student) return null;
  const day = localDay(now);
  const info = dayInfo(now);

  const [classes, courses, queue, items] = await Promise.all([
    classesBetween(student, day, addDays(day, 13), now),
    progressCourses(student, now),
    rateQueueFor(student, now),
    feed(userId, 30),
  ]);

  const blocks = toBlocks(classes);
  const a = agenda(now, blocks, info);
  const todays = classes.filter((c) => localDay(new Date(c.start)) === day);
  const current = todays.find((c) => c.status === "now") ?? null;
  const next = todays.find((c) => c.status === "next") ?? null;
  const later = firstAfter(now, blocks);
  const laterView = later ? classes.find((c) => c.start === later.start.toISOString() && (c.courseId ?? c.code) === later.courseId) ?? null : null;
  const upcoming =
    laterView && (a.state !== "running" && a.state !== "before" && a.state !== "between")
      ? { label: `${localDay(new Date(laterView.start)) === addDays(day, 1) ? "Tomorrow" : weekdayName(new Date(laterView.start))} ${laterView.time}`, class: laterView }
      : null;

  const examPhase = nextPhase(now, ["midterm", "final"]);
  const examClasses = classes.filter((c) => c.kind === "exam" && new Date(c.end) > now);
  const exams = examClasses.map((c) => examView(c, now, examPhase));
  const weekEnd = addDays(day, 7);
  const examsThisWeek = exams.filter((e) => e.start.slice(0, 10) <= weekEnd);

  const focus = current ?? next;
  const lessonIds = focus?.lessonIds ?? [];
  const [materialRows, cards, feedCourses, overrides] = await Promise.all([
    lessonIds.length ? db().select().from(lmsFiles).where(inArray(lmsFiles.lessonId, lessonIds)) : Promise.resolve([]),
    courseCards(student, courses),
    coursesByIds(items.map((i) => i.courseId ?? "").filter(Boolean)),
    lessonIds.length ? fileOverridesMap() : Promise.resolve({}),
  ]);

  const feedRows = await feedViews(items.slice(0, 4), now, feedCourses);

  const tight = courses.filter((c) => c.absences).sort((x, y) => x.absences!.left - y.absences!.left)[0];
  const firstExam = exams[0];
  const phase = info.week?.kind === "break" ? nextPhase(now, ["break"]) : null;

  return {
    now: now.toISOString(),
    firstName: givenName(student.cache?.profile?.name),
    title: info.weekend ? weekdayName(now) : "Today",
    weekLabel: phase ? `Break · ${range(phase.starts, phase.ends)}` : info.label,
    state: a.state,
    sync: student.state,
    banner: banner(student, now, { courses, classes, exams, term: queue.currentTerm }),
    tiles: {
      nextClass: (next ?? current)?.time ?? laterView?.time ?? null,
      absences: tight?.absences ? { left: tight.absences.left, courseId: tight.courseId, name: tight.name } : null,
      exam: firstExam ? { label: `Exam ${DAY_ABBR[localWeekday(new Date(firstExam.start))]}`, start: firstExam.start } : null,
      courses: courses.length,
      qrOpen: checkInOpen(a.current ?? a.next, now),
    },
    classes: todays,
    current,
    next,
    upcoming,
    materials: focus ? overlayAll(materialRows.map((f) => lmsFileItem(f, { code: focus.code, name: focus.name }, new Map())), overrides) : [],
    phase: phase ? { kind: phase.kind, title: phase.title, starts: phase.starts, ends: phase.ends, inDays: phase.inDays, rangeLabel: `Until ${shortDate(addDays(phase.ends, 1))}` } : examPhase && examPhase.inDays <= 21 ? { kind: examPhase.kind, title: examPhase.title, starts: examPhase.starts, ends: examPhase.ends, inDays: examPhase.inDays, rangeLabel: range(examPhase.starts, examPhase.ends) } : null,
    examsThisWeek,
    nextExams: exams.slice(0, 3),
    rating: queue.ask,
    notifications: { unread: unreadCount(items), items: feedRows },
    dueSoon: dueSoon(student.sync.homework, now, 7).slice(0, 3).map((d) => deadlineView(d, now)),
    courses: cards,
  };
}

