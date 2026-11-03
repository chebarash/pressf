import { attendance, attendanceEvents, attendanceLine, type AttendanceStatus, type LmsAdmit, type LmsAttendanceEvent, type Mark } from "./attendance";
import { tier } from "./grades";
import { clock, shortDate, weekdayName } from "./time";

/**
 * What a grade or attendance feed item is about, read back from the item
 * itself (its id carries the course, the class and the mark; old rows too)
 * and, when given, the student's current gradebook for the class time, the
 * mark as it stands now and the absences left. The feed row, the reading pane,
 * the sheet and the bot message all draw from this.
 */

export type MarkTier = "high" | "mid" | "low";

export type GradeMark = {
  /** "Midterm", "Quiz 5", "Final grade"; null when the item does not say. */
  what: string | null;
  score: number;
  /** 100 for course grades (final, average); null for class marks (the LMS sends no maximum). */
  max: number | null;
  tier: MarkTier;
};

export type AttendanceTone = "ok" | "warn" | "danger";

export type AttendanceMark = {
  /** "mark": one class marked absent or late; "limit": the absence limit is close. */
  kind: "mark" | "limit";
  /** "Lecture 7". */
  lesson: string | null;
  /** "Mon 3 Nov 13:30" (the time when the gradebook still has the class). */
  when: string | null;
  mark: Extract<Mark, "absent" | "late" | "excused"> | null;
  /** Absences still allowed now, the limit and how many are used. */
  left: number | null;
  limit: number | null;
  missed: number | null;
  status: AttendanceStatus | null;
  /** "3 absences left", "No absences left", "Over the absence limit". */
  line: string | null;
  tone: AttendanceTone;
};

/** The course as the gradebook has it now (`SyncedCourse` fits). */
export type GradebookCourse = { subjectId: string; admit?: LmsAdmit | null; events: Array<LmsAttendanceEvent & { mark?: unknown }> };

const TIER: Record<"High" | "Mid" | "Low", MarkTier> = { High: "high", Mid: "mid", Low: "low" };

/**
 * Tier of a mark on the app's grade scale (High ≥ 85, Mid ≥ 65, Low below).
 * Class marks come without a maximum; up to 10 they are read as out of 10
 * (the LMS's class marks), anything larger as out of 100.
 */
export function markTier(score: number, max: number | null): MarkTier {
  const scale = max ?? (score <= 10 ? 10 : 100);
  const t = tier((score / scale) * 100);
  return t === "None" ? "low" : TIER[t];
}

/** "Lecture № 7" → "Lecture 7"; extra spaces dropped. */
export const lessonLabel = (name: string) => name.replace(/\s*№\s*/g, " ").replace(/\s+/g, " ").trim();

/** "Midterm" from "midterm", keeps "Quiz 5" and "MCQ test" as they are. */
const sentence = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const num = (v: string | undefined) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : null;
};

/**
 * A grade item: id `grade:<courseId>:final:<mark>` or
 * `grade:<courseId>:ev:<time>:<class name>:<mark>` (the sync's own keys).
 */
export function gradeMark(item: { id: string; kind: string; title?: string }): GradeMark | null {
  if (item.kind !== "grade") return null;
  const m = item.id.match(/^grade:[^:]+:(final|ev):(.*):([^:]+)$|^grade:[^:]+:(final):([^:]+)$/);
  if (!m) return null;
  const final = m[1] === "final" || m[4] === "final";
  const score = num(final && m[4] ? m[5] : m[3]);
  if (score === null) return null;
  // ev: "<time>:<class name>"; the name may itself hold colons.
  const lesson = !final ? lessonLabel((m[2] ?? "").replace(/^[^:]*:/, "")) : "";
  const what = final ? "Final grade" : lesson ? sentence(lesson) : null;
  const max = final ? 100 : null;
  return { what, score, max, tier: markTier(score, max) };
}

const MARKS: Record<string, AttendanceMark["mark"]> = { "2": "late", "3": "absent", "4": "excused" };

const dayLabel = (at: Date) => `${weekdayName(at).slice(0, 3)} ${shortDate(at)}`;

export const toneOf = (status: AttendanceStatus | null): AttendanceTone => (status === "over" || status === "last" ? "danger" : status === "low" ? "warn" : "ok");

/**
 * An attendance item: `absence:<courseId>:<class name>` (one class) or
 * `absence-limit:<courseId>:<left>` (the limit is close). Old rows carry the
 * class date in the body ("Calculus 1 · Lecture 7 · Mon 3 Nov") and the
 * absences left in the title ("Marked absent · 3 left"); the gradebook, when
 * given, adds the class time and what is left now.
 */
export function attendanceMark(item: { id: string; kind: string; title?: string; body?: string | null }, course?: GradebookCourse | null): AttendanceMark | null {
  if (item.kind !== "absence") return null;
  const limitItem = item.id.match(/^absence-limit:([^:]+):(\d+)$/);
  const one = limitItem ? null : item.id.match(/^absence:([^:]+):(.+)$/);
  if (!limitItem && !one) return null;
  const now = attendance(course?.admit ?? null);
  // The title's own count ("Marked absent · 3 left", "Careful: 2 absences left") when the gradebook has none.
  const said = num(item.title?.match(/(\d+)\s+(?:absences?\s+)?left/)?.[1]);
  const used = item.body?.match(/(\d+) of (\d+) used/);
  const left = now?.left ?? said ?? (limitItem ? Number(limitItem[2]) : null);
  const limit = now?.limit ?? num(used?.[2]);
  const missed = now?.missed ?? num(used?.[1]);
  const status: AttendanceStatus | null = now?.status ?? (left === null ? null : left === 0 ? "last" : left <= 2 ? "low" : "ok");
  const line = now ? attendanceLine(now) : left === null ? null : left === 0 ? "No absences left" : `${left} ${left === 1 ? "absence" : "absences"} left`;
  const base = { left, limit, missed, status, line, tone: toneOf(status) };
  if (limitItem) return { kind: "limit", lesson: null, when: null, mark: null, ...base };

  const name = one![2];
  const events = course?.events ?? [];
  const index = events.findIndex((e) => (e.lesson_name ?? "").trim() === name.trim());
  const event = index >= 0 ? attendanceEvents([events[index]])[0] : null;
  const fromBody = item.body?.split(" · ").find((p) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} \w{3}/.test(p)) ?? null;
  const when = event?.at ? `${dayLabel(event.at)} ${clock(event.at)}` : fromBody;
  const status3 = index >= 0 ? MARKS[String(events[index].status ?? "")] ?? null : null;
  return { kind: "mark", lesson: lessonLabel(name), when, mark: status3 ?? "absent", ...base };
}

/** "Absent", "Late", "Excused". */
export const MARK_LABEL: Record<NonNullable<AttendanceMark["mark"]>, string> = { absent: "Absent", late: "Late", excused: "Excused" };

/** "87 / 100", or "8" for a class mark without a known maximum. */
export const scoreText = (g: Pick<GradeMark, "score" | "max">) => (g.max ? `${g.score} / ${g.max}` : String(g.score));
