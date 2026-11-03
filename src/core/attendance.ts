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

/**
 * One class in the gradebook (`resultSubjects[id].events[]`), as the LMS sends it:
 * `status` 0 not marked yet, 1 attended, 2 late, 3 absent, 4 excused absence
 * (the LMS front end's own table); `qr_auto_set_status` 1 when the QR system
 * set the status (a scan for present/late, the closed session for absent);
 * `time` is when the mark was set, while the class time is `schedule[0].begin_time`.
 * `lesson_type` is the lesson-type id: 0 lecture, 1 tutorial, 2 lab, 3 practice,
 * 5/6 independent work.
 */
export type LmsAttendanceEvent = {
  id?: number | string;
  lesson_id?: number | string | null;
  lesson_name?: string;
  lesson_number?: number | string | null;
  lesson_type?: number | string;
  status?: number | string;
  qr_auto_set_status?: number | string | null;
  time?: number | string | null;
  /** Normalised class start (unix seconds), filled from `schedule[0].begin_time` by the sync. */
  at?: number | string | null;
  schedule?: Array<{ begin_time?: number | string | null; end_time?: number | string | null }> | Record<string, unknown> | null;
  is_siw?: number | string | null;
};

export type AttendanceStatus = "ok" | "low" | "last" | "over";
export type Mark = "present" | "late" | "absent" | "excused" | "unmarked";

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
  // A course with no classes counted (internships, projects) has no absence limit to show.
  if (num(admit.lessons_count) === 0 && num(admit.absence_count_all) === 0 && num(admit.avaibale_count_all) === 0) return null;
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

const MARKS: Record<string, Mark> = { "0": "unmarked", "1": "present", "2": "late", "3": "absent", "4": "excused" };

export type AttendanceEvent = {
  lesson: string;
  kind: "lecture" | "lab" | "practice";
  /** When the class took place (falls back to when it was marked). */
  at: Date | null;
  mark: Mark;
  /** Checked in by scanning the class QR code (present or late). */
  viaQr: boolean;
};

const unix = (v: unknown) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) && n > 0 ? new Date(n < 1e12 ? n * 1000 : n) : null;
};

/** The class start: the sync's `at`, else the scheduled slot, else the time it was marked. */
export function classTime(e: LmsAttendanceEvent): Date | null {
  const slot = Array.isArray(e.schedule) ? e.schedule[0] : null;
  return unix(e.at) ?? unix(slot?.begin_time) ?? unix(e.time);
}

const kindOf = (t: unknown): AttendanceEvent["kind"] => {
  const v = String(t ?? "");
  return v === "0" ? "lecture" : v === "2" ? "lab" : "practice";
};

export function attendanceEvents(events: LmsAttendanceEvent[] | null | undefined): AttendanceEvent[] {
  return (events ?? []).map((e) => {
    const mark = MARKS[String(e.status ?? 0)] ?? "unmarked";
    return {
      lesson: (e.lesson_name ?? "").trim() || "Class",
      kind: kindOf(e.lesson_type),
      at: classTime(e),
      mark,
      // On an absence the flag means the QR session closed without a scan, not a check-in.
      viaQr: String(e.qr_auto_set_status ?? "") === "1" && (mark === "present" || mark === "late"),
    };
  });
}

/** New absences between two snapshots, to alert the student once per absence. */
export function newAbsences(before: AttendanceEvent[], after: AttendanceEvent[]) {
  // Keyed by lesson name ("Lecture № 7" is unique within a course): older snapshots
  // dated classes by the marking time, newer ones by the class time.
  const key = (e: AttendanceEvent) => e.lesson;
  const seen = new Set(before.filter((e) => e.mark === "absent").map(key));
  return after.filter((e) => e.mark === "absent" && !seen.has(key(e)));
}
