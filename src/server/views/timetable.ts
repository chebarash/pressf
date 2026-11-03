import { inArray } from "drizzle-orm";
import { dayInfo, type Holiday } from "@/core/semester";
import { addDays, dayStart, localDay, localWeekday, shortDate, weekdayName } from "@/core/time";
import { db } from "@/lib/db";
import { lmsCourses, lmsFiles } from "@/lib/db/schema";
import type { LmsLesson, LmsSubject } from "@/lib/lms/types";
import { fileOverridesMap, overlayAll } from "@/server/decisions";
import { classesBetween, type ClassView } from "./classes";
import { progressCourses, type AbsencesView } from "./progress";
import { DAY_ABBR, lmsFileItem, teacherNamesByCode, type FileItem } from "./shared";
import { loadStudent, type SyncState } from "./student";

/** Timetable (Figma 3.1–3.7) with the class sheet's data for each class. */

export type TimetableClass = ClassView & {
  /** "Lecture 15" from the LMS lesson, when the dated schedule names it. */
  lesson: string | null;
  materials: FileItem[];
  absences: AbsencesView | null;
};

export type TimetableView = {
  sync: SyncState;
  day: string;
  /** "Week 8, midterm exams" / "Week 8 of 16". */
  weekLabel: string | null;
  /** Monday–Friday of the selected day's week. */
  /** `off`: why a day without classes has none ("Constitution Day", "Break", "Weekend"); null on ordinary days. */
  week: Array<{ day: string; label: string; date: string; selected: boolean; today: boolean; classes: number; off?: string | null }>;
  classes: TimetableClass[];
  /** Every class of the selected day's week (Monday–Sunday), for the desktop week grid (D3). Always set by the server. */
  weekClasses?: ClassView[];
  holiday: Holiday | null;
  /** No classes that day: the next class, for "Next: Monday 10:00, Calculus 1 in B-204." */
  nextClass: { label: string; class: ClassView } | null;
};

export async function timetable(userId: string, day?: string, now = new Date()): Promise<TimetableView | null> {
  const student = await loadStudent(userId);
  if (!student) return null;
  const selected = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : localDay(now);
  const monday = addDays(selected, -((localWeekday(dayStart(selected)) + 6) % 7));
  const friday = addDays(monday, 4);
  const horizon = addDays(friday > selected ? friday : selected, 14);

  const [classes, courses] = await Promise.all([classesBetween(student, monday, horizon, now), progressCourses(student, now)]);
  // Mon–Fri, plus Saturday when there are classes on it (Entrepreneurship on Saturdays) or it is the day picked.
  const saturday = addDays(monday, 5);
  const saturdayClasses = classes.some((c) => localDay(new Date(c.start)) === saturday);
  const weekDays = [0, 1, 2, 3, 4, ...(saturdayClasses || selected === saturday ? [5] : [])].map((i) => addDays(monday, i));
  const onDay = classes.filter((c) => localDay(new Date(c.start)) === selected);
  const lessonIds = onDay.flatMap((c) => c.lessonIds);
  const courseIds = [...new Set(onDay.map((c) => c.courseId ?? "").filter(Boolean))];
  const [people, files, raws, overrides] = await Promise.all([
    teacherNamesByCode(),
    lessonIds.length ? db().select().from(lmsFiles).where(inArray(lmsFiles.lessonId, lessonIds)) : Promise.resolve([]),
    courseIds.length && lessonIds.length ? db().select({ id: lmsCourses.id, raw: lmsCourses.raw }).from(lmsCourses).where(inArray(lmsCourses.id, courseIds)) : Promise.resolve([]),
    lessonIds.length ? fileOverridesMap() : Promise.resolve({}),
  ]);
  const lessonName = new Map<string, string>();
  for (const r of raws) for (const l of ((r.raw as LmsSubject).lessons ?? []) as LmsLesson[]) lessonName.set(l.id, l.name);

  const info = dayInfo(dayStart(selected));
  const after = classes.find((c) => localDay(new Date(c.start)) > selected) ?? null;
  return {
    sync: student.state,
    day: selected,
    weekLabel: info.label,
    week: weekDays.map((d) => ({
      day: d, label: DAY_ABBR[localWeekday(dayStart(d))], date: shortDate(d), selected: d === selected, today: d === localDay(now),
      classes: classes.filter((c) => localDay(new Date(c.start)) === d).length,
      off: dayOff(d),
    })),
    classes: onDay.map((c) => ({
      ...c,
      lesson: c.lessonIds.map((id) => lessonName.get(id)).find(Boolean) ?? null,
      materials: overlayAll(files.filter((f) => c.lessonIds.includes(f.lessonId ?? "")).map((f) => lmsFileItem(f, { code: c.code, name: c.name, teachers: people[c.code] }, new Map())), overrides),
      absences: courses.find((p) => p.courseId === c.courseId)?.absences ?? null,
    })),
    weekClasses: classes.filter((c) => { const d = localDay(new Date(c.start)); return d >= monday && d <= addDays(monday, 6); }),
    holiday: info.holiday,
    nextClass: onDay.length || !after ? null : { label: `${weekdayName(new Date(after.start))} ${after.time}`, class: after },
  };
}

/** Why there are no regular classes on a day: a holiday, a break or registration week, the weekend; null otherwise. */
export function dayOff(day: string): string | null {
  const info = dayInfo(dayStart(day));
  if (info.holiday) return info.holiday.name === "Holiday" ? "Holiday" : `Holiday · ${info.holiday.name}`;
  if (info.weekend) return "Weekend";
  if (!info.week) return "No classes";
  if (info.week.kind === "teaching" || info.week.kind === "midterm" || info.week.kind === "final" || info.week.kind === "resit_exam" || info.week.kind === "induction") return null;
  return info.label ?? "No classes";
}
