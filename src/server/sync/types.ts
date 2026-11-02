import type { ClassKind } from "@/core/agenda";
import type { LmsAdmit, LmsAttendanceEvent, LmsHomework } from "@/lib/lms/types";

/**
 * What the per-student sync keeps in `user_state.snapshot.lms`: the student's
 * LMS gradebook, assignments and dated classes, plus what was already seen so
 * alerts fire once. Views read this; they never call the LMS. Dates are ISO
 * strings because the snapshot is JSON.
 */

export const SNAPSHOT_KEY = "lms";
/** Reminder keys already sent (digest, class, QR, rating…), key → ISO time. */
export const SENT_KEY = "sent";

export type SyncedSemester = {
  id: string;
  /** Normalized "Fall 2026". */
  term: string;
  year: number | null;
  open: boolean;
  starts: string | null;
  ends: string | null;
};

export type SyncedEvent = LmsAttendanceEvent & { mark?: number | string | null };

export type SyncedCourse = {
  /** LMS subject id (the gradebook key). */
  subjectId: string;
  semesterId: string;
  name: string;
  average: number | null;
  rating: number | null;
  final: number | null;
  passed: boolean | null;
  fx: boolean;
  admit: LmsAdmit | null;
  events: SyncedEvent[];
};

export type SyncedClass = {
  subjectId: string;
  start: string;
  end: string;
  room: string | null;
  teacherId: string | null;
  lessonId: string | null;
  kind: ClassKind;
  /** Earlier room or time, when the LMS moved this class since the last sync. */
  was: string | null;
};

export type SyncSnapshot = {
  /** Last fully successful sync. */
  at: string | null;
  /** Last attempt, successful or not. */
  tried: string | null;
  /** Set while the LMS is not answering; cleared on success. */
  error: string | null;
  semesters: SyncedSemester[];
  courses: SyncedCourse[];
  homework: LmsHomework[];
  schedule: SyncedClass[];
  /** The days `schedule` covers (YYYY-MM-DD, inclusive); outside it views use the weekly pattern. */
  scheduleWindow: { from: string; to: string } | null;
  /** LMS file ids already announced, per enrolled course. */
  seenFiles: string[];
  /** Mark per gradebook key, for "New grade" detection. */
  marks: Record<string, number | null>;
  /** When past semesters' gradebooks were last pulled. */
  pastAt: string | null;
};

export const emptySnapshot = (): SyncSnapshot => ({
  at: null, tried: null, error: null, semesters: [], courses: [], homework: [], schedule: [], scheduleWindow: null, seenFiles: [], marks: {}, pastAt: null,
});

/** "2025-2026 Spring semester" / "Fall 2026" → "Spring 2026" / "Fall 2026". */
export function termName(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  const season = text.match(/fall|autumn|spring|summer/i)?.[0]?.toLowerCase();
  const years = text.match(/\d{4}/g) ?? [];
  if (!season || !years.length) return text;
  const name = season === "autumn" || season === "fall" ? "Fall" : season === "spring" ? "Spring" : "Summer";
  const year = years.length > 1 && name !== "Fall" ? years[1] : years[0];
  return `${name} ${year}`;
}
