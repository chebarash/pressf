import { inArray } from "drizzle-orm";
import { milestoneId, milestoneLine, syllabusMilestones, termWeeks, weightLabel, type Milestone, type MilestoneClass } from "@/core/milestones";
import { addDays, localDay } from "@/core/time";
import { db } from "@/lib/db";
import { courseOverrides, syllabi, type SyllabusData } from "@/lib/db/schema";
import { termRank } from "@/lib/syllabus";
import type { CalendarEvent } from "./calendar";
import { classesBetween, type ClassView } from "./classes";
import type { Student } from "./student";

/**
 * The student's syllabus milestones for one term (src/core/milestones.ts),
 * from the newest matched syllabus of each course with the admin's edits on
 * top, placed on the student's classes of that whole term. Postgres only.
 */

export type PlacedMilestone = Milestone & {
  /** Stable: the feed item id and the calendar UID come from it. */
  id: string;
  courseName: string;
};

/** What a class block and its panel carry. */
export type ClassMilestone = { id: string; title: string; kind: Milestone["kind"]; certainty: Milestone["certainty"]; weight: string | null; line: string };

/** The newest matched syllabus of each course code, with admin edits on top. */
export async function syllabiFor(codes: string[]): Promise<Map<string, SyllabusData>> {
  const out = new Map<string, SyllabusData>();
  if (!codes.length) return out;
  const [rows, edits] = await Promise.all([
    db().select({ code: syllabi.courseCode, data: syllabi.data, matched: syllabi.matched }).from(syllabi).where(inArray(syllabi.courseCode, codes)),
    db().select().from(courseOverrides).where(inArray(courseOverrides.code, codes)),
  ]);
  for (const r of rows.filter((x) => x.matched).sort((a, b) => termRank(b.data) - termRank(a.data))) if (!out.has(r.code)) out.set(r.code, r.data);
  for (const e of edits) {
    const base = out.get(e.code);
    if (base) out.set(e.code, { ...base, ...e.data } as SyllabusData);
  }
  return out;
}

/** The term containing `day`: first and last day (Saturday after the last week). */
export function termSpan(day: string) {
  const weeks = termWeeks(day);
  if (!weeks.length) return null;
  return { weeks, from: weeks[0].starts, to: addDays(weeks.at(-1)!.ends, 1) };
}

/**
 * The milestones of the term containing `day`. `classes` may be given when the
 * caller already has the student's classes for (at least) that term.
 */
export function termMilestones(student: Student, day: string, now: Date, classes?: ClassView[]): Promise<PlacedMilestone[]> {
  const span = termSpan(day);
  if (!span) return Promise.resolve([]);
  if (classes) return compute(student, span, now, classes);
  // One request asks for the same term more than once (the weeks and Coming up): computed once per loaded student.
  const memo = MEMO.get(student) ?? new Map<string, Promise<PlacedMilestone[]>>();
  MEMO.set(student, memo);
  const hit = memo.get(span.from) ?? compute(student, span, now);
  memo.set(span.from, hit);
  return hit;
}

const MEMO = new WeakMap<Student, Map<string, Promise<PlacedMilestone[]>>>();

async function compute(student: Student, span: NonNullable<ReturnType<typeof termSpan>>, now: Date, classes?: ClassView[]): Promise<PlacedMilestone[]> {
  const list = classes ?? (await classesBetween(student, span.from, span.to, now));
  const codes = [...new Set(list.map((c) => c.code).filter(Boolean))];
  const plans = await syllabiFor(codes);
  if (!plans.size) return [];
  const names = new Map(list.map((c) => [c.code, c.name]));
  const mine: MilestoneClass[] = list.map((c) => ({ key: c.key, code: c.code, kind: c.kind, day: localDay(new Date(c.start)), start: c.start }));
  const out: PlacedMilestone[] = [];
  for (const [code, data] of plans) {
    for (const m of syllabusMilestones({ course_code: code, assessment: data.assessment ?? [], topics_by_week: data.topics_by_week ?? [] }, mine, span.weeks)) {
      out.push({ ...m, id: milestoneId(m), courseName: names.get(code) ?? data.course_title ?? code });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** Milestones by the class they are on. */
export function byClass(list: PlacedMilestone[]): Map<string, ClassMilestone[]> {
  const out = new Map<string, ClassMilestone[]>();
  for (const m of list) {
    if (!m.classKey) continue;
    out.set(m.classKey, [...(out.get(m.classKey) ?? []), { id: m.id, title: m.title, kind: m.kind, certainty: m.certainty, weight: weightLabel(m), line: milestoneLine(m) }]);
  }
  return out;
}

/** A milestone as a calendar event (the "syllabus" layer): Coming up, and the all-day ones in Week and Month. */
export function milestoneEvent(m: PlacedMilestone): CalendarEvent {
  const likely = m.certainty === "inferred" ? (m.classKey ? " · likely" : " · sometime this week") : "";
  return {
    key: m.id,
    layer: "syllabus",
    title: `${m.title} · ${m.courseName}`,
    sub: ["From the syllabus", weightLabel(m)].filter(Boolean).join(" · ") + likely,
    day: m.day,
    endDay: m.endDay,
    time: null,
    href: m.courseCode ? `/c/${m.courseCode}` : null,
  };
}
