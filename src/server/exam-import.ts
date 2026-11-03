import { z } from "zod";
import { normCode, normRoom, normStudentId, parseCourseName, parseCourses, parseTime, type Normalised } from "@/core/exams";
import { ExamError, importSchedule } from "./exams";

/**
 * The operator path: an exam schedule already read by a person (the lead reads
 * the sheet, writes this JSON, posts it). Re-posting the same source replaces
 * its rows and notifies students whose exam moved.
 *
 * {
 *   "window": { "name": "Midterm", "starts": "2026-11-02", "ends": "2026-11-06" },
 *   "source": { "label": "Students Fall 2026 MidTerm", "url": "https://docs.google.com/…" },
 *   "exams": [{ "course": "CS412 Deep Learning", "date": "2026-11-02", "start": "12:30", "durationMin": 120, "rooms": ["MATH 106"] }],
 *   "seats": [{ "studentId": "220066", "course": "CS412", "date": "2026-11-02", "start": "12:30", "room": "MATH 106" }]
 * }
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const time = z.string().trim().min(1).max(20);

export const ExamImport = z.object({
  window: z.object({ name: z.string().trim().min(1).max(80), starts: day, ends: day }),
  source: z.object({ label: z.string().trim().min(1).max(200), url: z.string().trim().url().max(500).nullish() }),
  exams: z.array(z.object({
    course: z.string().trim().min(1).max(200),
    date: day,
    start: time,
    durationMin: z.number().int().min(10).max(600).nullish(),
    rooms: z.array(z.string().trim().min(1).max(60)).max(80).default([]),
    seats: z.number().int().min(0).max(5000).nullish(),
  })).min(1).max(5000),
  seats: z.array(z.object({
    studentId: z.union([z.string(), z.number()]).transform((v) => normStudentId(String(v))),
    course: z.string().trim().min(1).max(200),
    date: day,
    start: time,
    room: z.string().trim().max(60).nullish(),
  })).max(50_000).optional(),
});

export type ExamImportBody = z.infer<typeof ExamImport>;

function course(text: string) {
  // A bare code ("MATH111") reads like a room to the sheet analyser; here the field is a course.
  if (/^[A-Za-z]{2,5}\s?-?\s?\d{3}[A-Za-z]?$/.test(text.trim())) return { code: normCode(text), name: null, minutes: null };
  const [hit] = parseCourses(text);
  if (hit) return { code: hit.code, name: hit.name, minutes: hit.minutes };
  const named = parseCourseName(text);
  return { code: null, name: named?.name ?? text, minutes: named?.minutes ?? null };
}

function hhmm(text: string, where: string) {
  const t = parseTime(text);
  if (!t) throw new ExamError(`${where}: "${text}" is not a time`);
  return t.start;
}

/** Validates and stores one posted schedule. */
export async function importJson(body: unknown, actor: string | null, now?: Date) {
  const parsed = ExamImport.safeParse(body);
  if (!parsed.success) throw new ExamError(`Bad schedule: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  const b = parsed.data;
  if (b.window.ends < b.window.starts) throw new ExamError("window.ends is before window.starts");
  const data: Normalised = {
    exams: b.exams.map((e, i) => {
      const c = course(e.course);
      return { code: c.code, name: c.name, date: e.date, start: hhmm(e.start, `exams[${i}]`), minutes: e.durationMin ?? c.minutes ?? 120, rooms: e.rooms.map(normRoom), seats: e.seats ?? null };
    }),
    seats: (b.seats ?? []).map((s, i) => {
      const c = course(s.course);
      return { studentId: s.studentId, code: c.code, name: c.name, date: s.date, start: hhmm(s.start, `seats[${i}]`), minutes: null, room: s.room ? normRoom(s.room) : null };
    }),
  };
  const url = b.source.url ?? null;
  const key = url ? url.split("#")[0] : `import:${b.source.label.toLowerCase()}`;
  return importSchedule({ key, label: b.source.label, url, origin: "import", window: b.window }, data, { actor, now });
}
