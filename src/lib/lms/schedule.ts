import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { lmsCourses, lmsTeachers } from "@/lib/db/schema";
import { scheduleList } from "@/lib/lms/client";
import { sessionFor } from "@/lib/lms/store";
import type { Lesson } from "@/lib/catalog/types";
import { kindOf, roomLabel } from "@/core/agenda";

/**
 * The signed-in student's own weekly timetable, read live from the LMS. The LMS
 * lists every dated occurrence, so a two-week window is folded into one weekly
 * pattern. Times and weekday are read in Tashkent, where the university sits.
 */

const TZ = "Asia/Tashkent";
const WEEKDAY = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 } as const;

function at(ts: number) {
  const d = new Date(ts * 1000);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d).slice(0, 3) as keyof typeof WEEKDAY;
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const [h, m] = time.split(":").map(Number);
  return { day: WEEKDAY[wd] ?? 0, time, min: h * 60 + m };
}

/** Back-to-back hours of the same class count as one session, up to this gap. */
const MERGE_GAP_MIN = 20;

/** A string, `{ name }`, or (real `/schedule/list`) `{ aud_num: "306", campus: { name } }`. */
const roomOf = (a: Parameters<typeof roomLabel>[0]) => roomLabel(a);

export async function studentTimetable(userId: string): Promise<Lesson[] | null> {
  const session = await sessionFor(userId);
  if (!session) return null;

  const now = Math.floor(Date.now() / 1000);
  const days = await scheduleList(session, now - 7 * 86400, now + 7 * 86400).catch(() => null);
  if (!days) return null;
  const events = days.flatMap((d) => d.events ?? []).filter((e) => e.begin_time && e.subject_id);
  if (!events.length) return [];

  const subjectIds = [...new Set(events.map((e) => e.subject_id!))];
  const teacherIds = [...new Set(events.map((e) => e.employee_id).filter((id): id is string => !!id))];
  const [courses, teachers] = await Promise.all([
    db().select({ id: lmsCourses.id, code: lmsCourses.code, name: lmsCourses.name }).from(lmsCourses).where(inArray(lmsCourses.id, subjectIds)),
    teacherIds.length ? db().select({ id: lmsTeachers.id, first: lmsTeachers.firstName, sur: lmsTeachers.surName }).from(lmsTeachers).where(inArray(lmsTeachers.id, teacherIds)) : Promise.resolve([]),
  ]);
  const course = new Map(courses.map((c) => [c.id, c]));
  const teacher = new Map(teachers.map((t) => [t.id, [t.first, t.sur].filter(Boolean).join(" ").trim() || null]));

  // The LMS splits one class into consecutive hour-long entries. Collect the
  // distinct pieces per weekday+course+teacher, then merge back-to-back ones
  // into a single session spanning the whole time.
  type Piece = { day: number; code: string; subject: string; kind: Lesson["kind"]; teacher: string | null; teacher_name: string | null; room: string | null; startMin: number; endMin: number; starts: string; ends: string };
  const byClass = new Map<string, Map<string, Piece>>();
  for (const e of events) {
    const c = course.get(e.subject_id!);
    if (!c) continue;
    const start = at(Number(e.begin_time));
    const end = e.end_time ? at(Number(e.end_time)) : null;
    // The class type keeps a lecture and the lab after it apart, even with the same teacher.
    const kind = kindOf((e as { subjectType?: { name?: string } | null }).subjectType?.name);
    const groupKey = `${start.day}|${c.code}|${e.employee_id ?? ""}|${kind}`;
    const piece: Piece = {
      day: start.day, code: c.code, subject: c.name, kind,
      teacher: e.employee_id ?? null, teacher_name: e.employee_id ? teacher.get(e.employee_id) ?? null : null,
      room: roomOf(e.auditorium), startMin: start.min, endMin: end?.min ?? start.min, starts: start.time, ends: end?.time ?? "",
    };
    const pieces = byClass.get(groupKey) ?? byClass.set(groupKey, new Map()).get(groupKey)!;
    pieces.set(String(start.min), piece); // dedupe repeated weeks by start time
  }

  const lessons: Lesson[] = [];
  for (const pieces of byClass.values()) {
    const sorted = [...pieces.values()].sort((a, b) => a.startMin - b.startMin);
    let run: Piece | null = null;
    const flush = () => { if (run) lessons.push({ class: "", day: run.day, starts: run.starts, ends: run.ends, subject: run.subject, code: run.code, kind: run.kind, teacher: run.teacher, teacher_name: run.teacher_name, room: run.room }); };
    for (const p of sorted) {
      if (run && p.startMin - run.endMin <= MERGE_GAP_MIN) {
        if (p.endMin > run.endMin) { run.endMin = p.endMin; run.ends = p.ends; }
      } else { flush(); run = { ...p }; }
    }
    flush();
  }
  return lessons.sort((a, b) => a.day - b.day || a.starts.localeCompare(b.starts));
}
