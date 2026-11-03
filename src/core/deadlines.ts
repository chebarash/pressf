import type { LmsHomework } from "@/lib/lms/types";

/** Assignments from the LMS, normalized for "Due soon". */

export type DeadlineStatus = "todo" | "in-progress" | "submitted" | "checked" | "missed" | "archived";

export type Deadline = { id: string; course: string; title: string; due: Date; status: DeadlineStatus; grade: number | null };

/** `status_name` comes in Russian even with `lang=en` ("Не готово"), so both languages are read. */
const STATUS: Array<[RegExp, DeadlineStatus]> = [
  [/not submitted|не сдан/i, "missed"],
  [/not ready|не готов/i, "todo"],
  [/in process|on completion|в процессе|в работе|на доработ/i, "in-progress"],
  [/under review|на проверк/i, "submitted"],
  [/checked|провер(ено|ен)/i, "checked"],
  [/archive|архив/i, "archived"],
];

export function deadline(h: LmsHomework): Deadline | null {
  const due = Number(h.time);
  if (!Number.isFinite(due) || due <= 0) return null;
  const course = typeof h.subject === "string" ? h.subject : h.subject?.name ?? "";
  const status = STATUS.find(([re]) => re.test(h.status_name ?? ""))?.[1] ?? "todo";
  const grade = h.rating === null || h.rating === undefined || h.rating === "" ? null : Number(h.rating);
  const id = h.id ?? h.homework_working_id ?? h.homework_id;
  return { id: String(id ?? `${course}:${due}`), course, title: h.theme_name?.trim() || "Assignment", due: new Date(due * 1000), status, grade: Number.isFinite(grade) ? grade : null };
}

/** Open work due in the next `days`, soonest first. */
export function dueSoon(list: LmsHomework[], now: Date, days = 7): Deadline[] {
  const limit = now.getTime() + days * 86_400_000;
  return list
    .map(deadline)
    .filter((d): d is Deadline => !!d && (d.status === "todo" || d.status === "in-progress") && d.due.getTime() >= now.getTime() && d.due.getTime() <= limit)
    .sort((a, b) => a.due.getTime() - b.due.getTime());
}

/** Bot reminders: 48 h and 3 h before, for work not yet handed in. */
export const REMINDER_OFFSETS_H = [48, 3];
export function remindersDue(d: Deadline, now: Date, lastRunAt: Date) {
  return REMINDER_OFFSETS_H.filter((h) => {
    const at = d.due.getTime() - h * 3600_000;
    return at > lastRunAt.getTime() && at <= now.getTime();
  });
}
