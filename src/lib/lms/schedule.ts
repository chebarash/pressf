import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { lmsCourses, lmsTeachers } from "@/lib/db/schema";
import { scheduleList } from "@/lib/lms/client";
import { sessionFor } from "@/lib/lms/store";
import type { Lesson } from "@/lib/catalog/types";

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
  return { day: WEEKDAY[wd] ?? 0, time };
}

const roomOf = (a: { name?: string } | string | null | undefined) =>
  (typeof a === "string" ? a : a?.name) || null;

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

  // One slot per weekday+time+course, collapsing the repeated occurrences.
  const slots = new Map<string, Lesson>();
  for (const e of events) {
    const c = course.get(e.subject_id!);
    if (!c) continue;
    const start = at(Number(e.begin_time));
    const end = e.end_time ? at(Number(e.end_time)).time : "";
    const key = `${start.day}|${start.time}|${c.code}|${e.employee_id ?? ""}`;
    if (slots.has(key)) continue;
    slots.set(key, {
      class: "", day: start.day, starts: start.time, ends: end,
      subject: c.name, code: c.code,
      teacher: e.employee_id ?? null, teacher_name: e.employee_id ? teacher.get(e.employee_id) ?? null : null,
      room: roomOf(e.auditorium),
    });
  }
  return [...slots.values()].sort((a, b) => a.day - b.day || a.starts.localeCompare(b.starts));
}
