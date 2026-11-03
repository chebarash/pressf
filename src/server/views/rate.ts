import { desc, eq, inArray } from "drizzle-orm";
import { askLevel, canEdit, rateQueue as queueOf, termKey, type RatingInput, type Recommend, type StoredRating, type TeacherRole } from "@/core/ratings";
import { roleOf } from "@/core/people";
import { ratingWindow } from "@/core/semester";
import { daysBetween, localDay, shortDate } from "@/core/time";
import { db } from "@/lib/db";
import { courseRatings, lmsCourseTeachers, ratingAsks, teacherRatings } from "@/lib/db/schema";
import { pseudonym } from "@/server/identity";
import { termName } from "@/server/sync/types";
import { coursesByIds, ROLE_LABEL, teachersByIds } from "./shared";
import { loadStudent, type Student } from "./student";
import { and } from "drizzle-orm";

/**
 * The rating queue (Figma 4.10, 8.6, Today's ask 2.1/2.11): past courses from
 * the student's own LMS gradebook that they have not rated, and their ratings.
 * Ratings are read by the HMAC pseudonym only.
 */

export type RateTeacher = { id: string; name: string; role: TeacherRole; roleLabel: string };

export type RateItem = {
  courseId: string;
  code: string;
  name: string;
  term: string;
  teachers: RateTeacher[];
  href: string;
};

export type RatedItem = RateItem & {
  recommend: Recommend;
  /** Teachers the student pressed F for. */
  pressedF: string[];
  updatedAt: string;
  updatedLabel: string;
  canEdit: boolean;
  /** The student's saved answers, to prefill "Edit your rating". Always set by the server. */
  answers?: RatingInput;
};

export type RateAsk = { level: "none" | "card" | "banner" | "shine"; term: string | null; waiting: RateItem[] };

export type RateQueueView = {
  /** The semester running now ("Fall 2026"), from the LMS. */
  currentTerm: string | null;
  waiting: RateItem[];
  rated: RatedItem[];
  /** Courses taken in past semesters (waiting + rated). */
  total: number;
  /**
   * This semester's courses not rated yet, once the rating window is open (the
   * last 3 teaching weeks onward, Figma 4.2 "Rate this course"). Not part of the ask. Always set by the server.
   */
  current?: RateItem[];
  /** The window for this semester's courses: closed until teaching week `opensIn`. */
  window?: { open: boolean; opensIn: number | null };
  ask: RateAsk;
};

export function currentTerm(student: Student): string | null {
  const open = student.sync.semesters.find((s) => s.open);
  return open?.term ?? (student.cache?.enrollment?.semesterName ? termName(student.cache.enrollment.semesterName) : null);
}

export async function rateQueueFor(student: Student, now = new Date()): Promise<RateQueueView> {
  const term = currentTerm(student);
  const semesterTerm = new Map(student.sync.semesters.map((s) => [s.id, s]));
  const taken = student.sync.courses
    .map((c) => ({ courseId: c.subjectId, term: semesterTerm.get(c.semesterId)?.term ?? "", semesterId: c.semesterId }))
    .filter((c) => c.term);

  const rater = pseudonym(student.userId, "rater");
  const [mine, asks] = await Promise.all([
    db().select().from(courseRatings).where(eq(courseRatings.rater, rater)).orderBy(desc(courseRatings.updatedAt)),
    db().select().from(ratingAsks).where(eq(ratingAsks.userId, student.userId)),
  ]);
  const ratedKeys = new Set(mine.map((r) => `${r.courseId}|${r.term}`));
  const waitingRaw = term ? queueOf(taken, ratedKeys, term) : [];
  const window = ratingWindow(now);
  const currentRaw = term && window.open ? taken.filter((c) => c.term === term && !ratedKeys.has(`${c.courseId}|${c.term}`)) : [];

  const ids = [...new Set([...waitingRaw.map((w) => w.courseId), ...currentRaw.map((w) => w.courseId), ...mine.map((r) => r.courseId)])];
  const [courses, links, answers] = await Promise.all([
    coursesByIds(ids),
    ids.length ? db().select().from(lmsCourseTeachers).where(inArray(lmsCourseTeachers.courseId, ids)) : Promise.resolve([]),
    mine.length ? db().select().from(teacherRatings).where(inArray(teacherRatings.ratingId, mine.map((r) => r.id))) : Promise.resolve([]),
  ]);
  const people = await teachersByIds([...links.map((l) => l.teacherId), ...answers.map((a) => a.teacherId)]);

  const teachersOf = (courseId: string): RateTeacher[] => {
    const seen = new Set<string>();
    return links
      .filter((l) => l.courseId === courseId)
      .map((l) => ({ id: l.teacherId, role: roleOf(l.role) }))
      .filter((t) => (seen.has(`${t.id}|${t.role}`) ? false : (seen.add(`${t.id}|${t.role}`), true)))
      .map((t) => ({ ...t, name: people.get(t.id)?.name ?? "Teacher", roleLabel: ROLE_LABEL[t.role] }));
  };
  const item = (courseId: string, t: string): RateItem => {
    const c = courses.get(courseId);
    return { courseId, code: c?.code ?? "", name: c?.name ?? "Course", term: t, teachers: teachersOf(courseId), href: `/rate/${courseId}` };
  };

  const waiting = waitingRaw.map((w) => item(w.courseId, w.term));
  const rated: RatedItem[] = mine.map((r) => ({
    ...item(r.courseId, r.term),
    recommend: r.recommend,
    pressedF: answers.filter((a) => a.ratingId === r.id && a.pressF).map((a) => people.get(a.teacherId)?.name ?? "Teacher"),
    updatedAt: r.updatedAt.toISOString(),
    updatedLabel: shortDate(r.updatedAt),
    canEdit: term ? canEdit(r.term, term) : true,
    answers: answersOf(r, answers),
  }));

  const askTerm = waiting.length ? [...waiting].sort((a, b) => termKey(b.term) - termKey(a.term))[0].term : null;
  const ended = askTerm ? [...semesterTerm.values()].find((s) => s.term === askTerm)?.ends : null;
  const days = ended ? Math.max(0, daysBetween(ended.slice(0, 10), localDay(now))) : 0;
  const dismissals = asks.find((a) => a.term === askTerm)?.dismissals ?? 0;
  const level = askLevel(waiting.length, dismissals, days);

  return {
    currentTerm: term,
    waiting,
    rated,
    total: waiting.length + new Set(taken.filter((t) => t.term !== term && ratedKeys.has(`${t.courseId}|${t.term}`)).map((t) => `${t.courseId}|${t.term}`)).size,
    current: currentRaw.map((c) => item(c.courseId, c.term)),
    window,
    ask: { level, term: askTerm, waiting: waiting.filter((w) => w.term === askTerm) },
  };
}

type RatingRow = typeof courseRatings.$inferSelect;
type AnswerRow = typeof teacherRatings.$inferSelect;

/** A stored rating as the form's answers (recommend, hours, difficulty, tags, per-teacher Press F and tags). */
export const answersOf = (r: RatingRow, answers: AnswerRow[]): RatingInput => ({
  recommend: r.recommend,
  hours: (r.hours as RatingInput["hours"]) ?? null,
  difficulty: (r.difficulty as RatingInput["difficulty"]) ?? null,
  tags: r.tags as RatingInput["tags"],
  teachers: answers.filter((a) => a.ratingId === r.id).map((a) => ({ teacherId: a.teacherId, role: a.role as TeacherRole, pressF: a.pressF, tags: a.tags as StoredRating["teachers"][number]["tags"] })),
});

/** Figma 4.10 "To rate" and 8.6 "My ratings". Null when the user does not exist. */
export async function rateQueue(userId: string, now = new Date()): Promise<RateQueueView | null> {
  const student = await loadStudent(userId);
  return student ? rateQueueFor(student, now) : null;
}

/** Whether this student already rated a course in a term (for "Edit your rating"). */
export async function myRatingFor(userId: string, courseIds: string[], term?: string | null) {
  if (!courseIds.length) return null;
  const [row] = await db()
    .select()
    .from(courseRatings)
    .where(and(eq(courseRatings.rater, pseudonym(userId, "rater")), inArray(courseRatings.courseId, courseIds), ...(term ? [eq(courseRatings.term, term)] : [])))
    .orderBy(desc(courseRatings.updatedAt))
    .limit(1);
  if (!row) return null;
  const answers = await db().select().from(teacherRatings).where(eq(teacherRatings.ratingId, row.id));
  return { term: row.term, recommend: row.recommend, courseId: row.courseId, answers: answersOf(row, answers) };
}
