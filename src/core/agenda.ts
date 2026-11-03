import type { DayInfo } from "./semester";
import { localDay } from "./time";

/**
 * The student's day: classes merged into blocks, what is running, what is next,
 * and which state the Today screen is in.
 */

export type ClassKind = "lecture" | "practice" | "lab" | "exam" | "other";

/** The LMS class type name ("Lecture", "Laboratory", "Tutorial", "Mid Term Exam") as our kind. */
export function kindOf(name: string | null | undefined): ClassKind {
  const t = (name ?? "").toLowerCase();
  if (/exam|midterm|final|quiz|control/.test(t)) return "exam";
  if (t.startsWith("lect")) return "lecture";
  if (t.startsWith("lab")) return "lab";
  if (/prac|tut|sem/.test(t)) return "practice";
  return "other";
}


export type ClassEvent = {
  courseId: string;
  courseName: string;
  /** Who teaches it, when known: a lecture and the next lab by someone else stay apart. */
  teacherId?: string | null;
  code?: string;
  kind: ClassKind;
  start: Date;
  end: Date;
  room?: string;
  teacher?: string;
  lessonId?: string;
  /** Set when the LMS moved the class (room or time changed). */
  changedFrom?: string;
};

export type ClassBlock = Omit<ClassEvent, "lessonId"> & { lessonIds: string[] };

/** Consecutive hours of the same class in the same room become one block. */
export function mergeBlocks(events: ClassEvent[], maxGapMin = 15): ClassBlock[] {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const blocks: ClassBlock[] = [];
  for (const e of sorted) {
    const last = blocks[blocks.length - 1];
    const gap = last ? (e.start.getTime() - last.end.getTime()) / 60_000 : Infinity;
    const sameTeacher = !last?.teacherId || !e.teacherId || last.teacherId === e.teacherId;
    if (last && last.courseId === e.courseId && last.kind === e.kind && sameTeacher && (last.room ?? "") === (e.room ?? "") && gap >= 0 && gap <= maxGapMin) {
      if (e.end > last.end) last.end = e.end;
      if (e.lessonId) last.lessonIds.push(e.lessonId);
      continue;
    }
    const { lessonId, ...rest } = e;
    blocks.push({ ...rest, start: new Date(e.start), end: new Date(e.end), lessonIds: lessonId ? [lessonId] : [] });
  }
  return blocks;
}

export type TodayState =
  | "before" // first class has not started
  | "running" // a class is on now
  | "between" // between classes
  | "over" // classes finished for today
  | "free" // a study day with no classes
  | "weekend"
  | "holiday"
  | "break"
  | "exams";

export type Agenda = {
  state: TodayState;
  blocks: ClassBlock[];
  current: ClassBlock | null;
  next: ClassBlock | null;
  done: ClassBlock[];
};

/** Today's agenda. `blocks` may span several days; only `now`'s day is used. */
export function agenda(now: Date, blocks: ClassBlock[], info: DayInfo): Agenda {
  const day = localDay(now);
  const today = blocks.filter((b) => localDay(b.start) === day);
  const current = today.find((b) => b.start <= now && now < b.end) ?? null;
  const next = today.find((b) => b.start > now) ?? null;
  const done = today.filter((b) => b.end <= now);
  const state: TodayState = info.holiday
    ? "holiday"
    : info.week?.kind === "break"
      ? "break"
      : info.weekend && today.length === 0
        ? "weekend"
        : (info.week?.kind === "midterm" || info.week?.kind === "final") && today.length === 0
          ? "exams"
          : today.length === 0
            ? "free"
            : current
              ? "running"
              : done.length === 0
                ? "before"
                : next
                  ? "between"
                  : "over";
  return { state, blocks: today, current, next, done };
}

/** The first class on a later day, for "Tomorrow 10:00 Calculus 1". */
export const firstAfter = (now: Date, blocks: ClassBlock[]) =>
  [...blocks].filter((b) => localDay(b.start) > localDay(now)).sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null;

/** QR check-in is offered from 5 min before a class until it ends. */
export const checkInOpen = (block: ClassBlock | null, now: Date) =>
  !!block && now.getTime() >= block.start.getTime() - 5 * 60_000 && now < block.end;
