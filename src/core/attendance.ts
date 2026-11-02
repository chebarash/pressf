/**
 * Attendance from the LMS gradebook `admit` block: how many classes the student
 * missed, how many more they may miss, and the per-lesson marks.
 */

export type LmsAdmit = {
  absence_count_all?: number | string | null;
  avaibale_count_all?: number | string | null;
  lessons_count?: number | string | null;
  admit?: number | string | null;
};

export type LmsAttendanceEvent = {
  lesson_name?: string;
  lesson_type?: number | string;
  status?: number | string;
  qr_auto_set_status?: number | string | null;
  time?: number | string;
};

export type AttendanceStatus = "ok" | "low" | "last" | "over";
export type Mark = "present" | "late" | "absent" | "unmarked";

export type Attendance = {
  missed: number;
  /** Absences still allowed before the limit. */
  left: number;
  limit: number;
  lessons: number;
  status: AttendanceStatus;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function attendance(admit: LmsAdmit | null | undefined): Attendance | null {
  if (!admit) return null;
  const missed = num(admit.absence_count_all);
  const left = Math.max(0, num(admit.avaibale_count_all));
  const limit = missed + left;
  const status: AttendanceStatus = num(admit.avaibale_count_all) < 0 ? "over" : left === 0 ? "last" : left <= 2 ? "low" : "ok";
  return { missed, left, limit, lessons: num(admit.lessons_count), status };
}

/** "2 absences left", "Last absence used", "Over the limit". */
export function attendanceLine(a: Attendance) {
  if (a.status === "over") return "Over the absence limit";
  if (a.status === "last") return "No absences left";
  return `${a.left} ${a.left === 1 ? "absence" : "absences"} left`;
}

const MARKS: Record<string, Mark> = { "0": "unmarked", "1": "present", "2": "late", "3": "absent" };

export type AttendanceEvent = { lesson: string; kind: "lecture" | "lab" | "practice"; at: Date | null; mark: Mark; viaQr: boolean };

export function attendanceEvents(events: LmsAttendanceEvent[] | null | undefined): AttendanceEvent[] {
  return (events ?? []).map((e) => ({
    lesson: e.lesson_name ?? "Class",
    kind: String(e.lesson_type) === "0" ? "lecture" : String(e.lesson_type) === "2" ? "lab" : "practice",
    at: e.time ? new Date(num(e.time) * 1000) : null,
    mark: MARKS[String(e.status ?? 0)] ?? "unmarked",
    viaQr: String(e.qr_auto_set_status ?? "") === "1",
  }));
}

/** New absences between two snapshots, to alert the student once per absence. */
export function newAbsences(before: AttendanceEvent[], after: AttendanceEvent[]) {
  const key = (e: AttendanceEvent) => `${e.lesson}@${e.at?.getTime() ?? ""}`;
  const seen = new Set(before.filter((e) => e.mark === "absent").map(key));
  return after.filter((e) => e.mark === "absent" && !seen.has(key(e)));
}
