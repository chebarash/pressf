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

/** A class as stored: the LMS event narrowed to what the views read (see `syncedEvent`). */
export type SyncedEvent = LmsAttendanceEvent & { mark?: number | string | null };

export type SyncedCourse = {
  /** LMS subject id (the gradebook key). */
  subjectId: string;
  semesterId: string;
  name: string;
  /** "T" in the LMS gradebook: the current-control average (type 4). */
  average: number | null;
  /** "Rating": the running weighted rating (type 0). */
  rating: number | null;
  /** The final grade; null until the LMS has one (an open semester's 0 is "not yet"). */
  final: number | null;
  passed: boolean | null;
  fx: boolean;
  /** "Admission" rating (`rd`, type 2), the score that admits to the final exam. */
  admission?: number | null;
  /** Admitted to the final exam (`admit.admit` 1, "Permit"); null when the LMS has not decided. */
  admitted?: boolean | null;
  /** "Final control": the exam mark (`e`, type 1). */
  exam?: number | null;
  /** Midterm exam (`rk`, type 5). */
  midterm?: number | null;
  /** Independent-work average (`siw_average`, type 6). */
  siw?: number | null;
  /** Teachers as the gradebook names them ("Given Family"). */
  teachers?: string[];
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
  /**
   * Shape version. 1 (or missing): written before the real LMS shapes were known
   * (averages lost, class times were marking times, no 2023-24 semesters); such
   * snapshots are re-read leniently and the next sync re-pulls every semester.
   */
  v?: number;
};

export const SNAPSHOT_VERSION = 2;

export const emptySnapshot = (): SyncSnapshot => ({
  at: null, tried: null, error: null, semesters: [], courses: [], homework: [], schedule: [], scheduleWindow: null, seenFiles: [], marks: {}, pastAt: null, v: SNAPSHOT_VERSION,
});

/**
 * "2025-2026 Spring semester" / "Fall (2026-2027)" / "Весенний (2026-2027)" →
 * "Spring 2026" / "Fall 2026" / "Spring 2027". The LMS falls back to Russian
 * (or Uzbek) where a semester has no English name, so those seasons count too.
 */
export function termName(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  const season = text.match(/fall|autumn|spring|summer|осен|весен|летн|kuz|bahor|yoz/i)?.[0]?.toLowerCase();
  const years = text.match(/\d{4}/g) ?? [];
  if (!season || !years.length) return text;
  const name = /^(autumn|fall|осен|kuz)/.test(season) ? "Fall" : /^(spring|весен|bahor)/.test(season) ? "Spring" : "Summer";
  const year = years.length > 1 && name !== "Fall" ? years[1] : years[0];
  return `${name} ${year}`;
}

/**
 * A stored snapshot made safe for the views, whatever version wrote it: missing
 * lists become empty, and in a running semester a final of 0 that did not pass
 * is "no final yet" (older snapshots stored the LMS placeholder as a real 0).
 * The averages older versions lost come back with the next sync, which an old
 * version triggers at once (see `outdated`).
 */
export function normalizeSnapshot(raw: Partial<SyncSnapshot> | null | undefined): SyncSnapshot {
  const sync: SyncSnapshot = { ...emptySnapshot(), v: 1, ...(raw ?? {}) };
  for (const k of ["semesters", "courses", "homework", "schedule", "seenFiles"] as const) if (!Array.isArray(sync[k])) (sync as Record<string, unknown>)[k] = [];
  if (!sync.marks || typeof sync.marks !== "object") sync.marks = {};
  const open = new Set(sync.semesters.filter((s) => s.open).map((s) => s.id));
  sync.courses = sync.courses.map((c) => {
    const final = c.final === 0 && !c.passed && open.has(c.semesterId) && !c.exam ? null : c.final ?? null;
    return { ...c, final, passed: final === null ? null : c.passed ?? null, events: Array.isArray(c.events) ? c.events : [] };
  });
  return sync;
}

/** Written by an older sync: re-pull it now rather than at the usual staleness. */
export const outdated = (sync: SyncSnapshot) => (sync.v ?? 1) < SNAPSHOT_VERSION && !!sync.at;
