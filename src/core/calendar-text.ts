import { weightLabel, type Milestone } from "./milestones";
import type { IcsAlarm } from "./ics";

/**
 * What the personal calendar feed writes into an event: the description of a
 * class (topic, syllabus milestone, the lesson's files as Press F links) and
 * the reminders (VALARM) the student chose in Settings → Calendar.
 */

/** "Reminders in Google": minutes before a class (0 = none), and the exam reminders (a day and an hour before). */
export type FeedAlarms = { classes: 0 | 15 | 30 | 60; exams: boolean };
export const DEFAULT_ALARMS: FeedAlarms = { classes: 15, exams: true };
export const CLASS_ALARM_CHOICES: FeedAlarms["classes"][] = [0, 15, 30, 60];

export function cleanAlarms(v: unknown): FeedAlarms {
  const o = (v && typeof v === "object" ? v : {}) as Partial<FeedAlarms>;
  return {
    classes: CLASS_ALARM_CHOICES.includes(o.classes as FeedAlarms["classes"]) ? (o.classes as FeedAlarms["classes"]) : DEFAULT_ALARMS.classes,
    exams: typeof o.exams === "boolean" ? o.exams : DEFAULT_ALARMS.exams,
  };
}

/** At most this many files are listed in one event; the rest are a count. */
export const FEED_FILES = 4;

/** "📝 Quiz 2 (10%) — from the syllabus", "… — from the syllabus, likely this lesson". */
export function milestoneNote(m: Pick<Milestone, "title" | "weight" | "of" | "certainty">) {
  const w = weightLabel(m);
  return `📝 ${m.title}${w ? ` (${w})` : ""} — from the syllabus${m.certainty === "inferred" ? ", likely this lesson" : ""}`;
}

/**
 * A class event's description, short: what and where, the syllabus topic of
 * the week, the milestone if any, and the lesson's files as links to their
 * Press F pages (`/f/<id>`, which ask to sign in; never a storage URL, those
 * expire).
 */
export function classDescription(a: {
  head: string;
  room?: string | null;
  teacher?: string | null;
  note?: string | null;
  topic?: string | null;
  milestones?: Array<Pick<Milestone, "title" | "weight" | "of" | "certainty">>;
  files?: Array<{ id: string; title: string }>;
  site: string;
  courseHref?: string | null;
}) {
  const files = a.files ?? [];
  const shown = files.slice(0, FEED_FILES);
  const more = files.length - shown.length;
  return [
    a.head,
    a.room ? `Room ${a.room}` : null,
    a.teacher ?? null,
    a.note ?? null,
    ...(a.milestones ?? []).map(milestoneNote),
    a.topic ? `Syllabus: ${a.topic}` : null,
    ...(shown.length ? ["Files:", ...shown.map((f) => `• ${f.title}: ${a.site}/f/${encodeURIComponent(f.id)}`)] : []),
    more > 0 ? `+${more} more${a.courseHref ? `: ${a.site}${a.courseHref}` : ""}` : null,
  ].filter(Boolean).join("\n");
}

/** The reminders of one event: classes N minutes before; exams (and a class with a milestone) a day and an hour before. */
export function alarmsFor(kind: "class" | "exam" | "milestone-day", alarms: FeedAlarms, title: string, hasMilestone = false): IcsAlarm[] {
  if (kind === "exam") return alarms.exams ? [{ minutes: 24 * 60, description: title }, { minutes: 60, description: title }] : [];
  // An all-day milestone: the evening before (18:00 the day before its date).
  if (kind === "milestone-day") return alarms.exams ? [{ minutes: 6 * 60, description: title }] : [];
  const out: IcsAlarm[] = alarms.classes ? [{ minutes: alarms.classes, description: title }] : [];
  if (hasMilestone && alarms.exams) out.unshift({ minutes: 24 * 60, description: title });
  return out;
}
