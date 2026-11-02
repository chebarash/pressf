import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { lmsCourseTeachers, lmsCourses, lmsDepartments, lmsPrograms, lmsTeachers } from "@/lib/db/schema";
import { departments, programs, subject, type LmsSession } from "@/lib/lms/client";
import type { LmsEmployee, LmsSubject } from "@/lib/lms/types";

/**
 * Harvests the whole university catalog from the LMS into our own tables, so
 * Press F can serve courses, teachers, schools and programs without the bot
 * API. Courses are found by walking subject ids (the LMS has no list endpoint);
 * a missing id returns an empty shell, so the walk stops after a long run of
 * misses. Runs on a schedule from a student's saved session.
 */

const CONCURRENCY = 6;
const PACE_MS = 120;
/** Stop after this many consecutive empty ids past the last real course. */
const STOP_GAP = 60;
/** Hard ceiling so a broken run can never loop forever. */
const MAX_ID = 3000;

const int = (v?: string | null) => {
  const n = Number(v);
  return v == null || v === "" || Number.isNaN(n) ? null : n;
};
const name = (e: LmsEmployee, part: "first" | "last" | "sur") => {
  const r = e as Record<string, string | undefined>;
  return (r[`${part}_name_en`] || r[`${part}_name_ru`] || "").trim() || null;
};

async function saveDepartmentsAndPrograms(session: LmsSession) {
  const [deps, progs] = await Promise.all([departments(session), programs(session)]);
  if (deps.length) {
    await db().insert(lmsDepartments).values(
      deps.map((d) => ({ id: d.id, code: d.code ?? null, parentId: d.parent_id ?? null, typeId: d.department_type_id ?? null, name: d.name, shortName: d.short_name ?? null }))
    ).onConflictDoUpdate({
      target: lmsDepartments.id,
      set: { code: sql`excluded.code`, parentId: sql`excluded.parent_id`, typeId: sql`excluded.type_id`, name: sql`excluded.name`, shortName: sql`excluded.short_name` },
    });
  }
  if (progs.length) {
    await db().insert(lmsPrograms).values(
      progs.map((p) => ({ id: p.id, name: p.name, departmentId: p.department_id ?? null, groupId: p.education_program_group_id ?? null, description: p.description ?? null }))
    ).onConflictDoUpdate({
      target: lmsPrograms.id,
      set: { name: sql`excluded.name`, departmentId: sql`excluded.department_id`, groupId: sql`excluded.group_id`, description: sql`excluded.description` },
    });
  }
  return { departments: deps.length, programs: progs.length };
}

async function saveCourse(c: LmsSubject) {
  await db().insert(lmsCourses).values({
    id: c.id, code: c.code, name: c.name,
    credits: int(c.credit_count), lectureHours: int(c.lecture_hours), labHours: int(c.laboratory_hours), practiceHours: int(c.practice_hours),
    departmentId: c.department?.id ?? null, semesterId: c.semester_id ?? null, raw: c, fetchedAt: new Date(),
  }).onConflictDoUpdate({
    target: lmsCourses.id,
    set: { code: sql`excluded.code`, name: sql`excluded.name`, credits: sql`excluded.credits`, lectureHours: sql`excluded.lecture_hours`, labHours: sql`excluded.lab_hours`, practiceHours: sql`excluded.practice_hours`, departmentId: sql`excluded.department_id`, semesterId: sql`excluded.semester_id`, raw: sql`excluded.raw`, fetchedAt: sql`excluded.fetched_at` },
  });

  const employees = c.employee ?? [];
  const seen = new Map<string, LmsEmployee>();
  for (const e of employees) if (e.employee_id) seen.set(e.employee_id, e);
  if (seen.size) {
    await db().insert(lmsTeachers).values(
      [...seen.values()].map((e) => ({ id: e.employee_id, firstName: name(e, "first"), lastName: name(e, "last"), surName: name(e, "sur"), fetchedAt: new Date() }))
    ).onConflictDoUpdate({
      target: lmsTeachers.id,
      set: { firstName: sql`excluded.first_name`, lastName: sql`excluded.last_name`, surName: sql`excluded.sur_name`, fetchedAt: sql`excluded.fetched_at` },
    });
  }
  // Rebuild this course's teacher links so dropped teachers disappear.
  await db().delete(lmsCourseTeachers).where(sql`${lmsCourseTeachers.courseId} = ${c.id}`);
  const links = new Map<string, { courseId: string; teacherId: string; role: string | null }>();
  for (const e of employees) if (e.employee_id) {
    const role = e.employee_type ?? null;
    links.set(`${e.employee_id}|${role}`, { courseId: c.id, teacherId: e.employee_id, role });
  }
  if (links.size) await db().insert(lmsCourseTeachers).values([...links.values()]).onConflictDoNothing();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Harvest departments, programs and every course the LMS will return. */
export async function harvestCatalog(session: LmsSession, opts: { maxId?: number; stopGap?: number } = {}) {
  const meta = await saveDepartmentsAndPrograms(session);
  const maxId = opts.maxId ?? MAX_ID;
  const stopGap = opts.stopGap ?? STOP_GAP;

  let courses = 0;
  let lastHit = 0;
  let id = 1;
  while (id <= maxId && id - lastHit <= stopGap) {
    const batch = Array.from({ length: CONCURRENCY }, (_, k) => id + k).filter((n) => n <= maxId);
    const results = await Promise.all(batch.map((n) => subject(session, n).catch(() => null)));
    for (let k = 0; k < batch.length; k++) {
      const c = results[k];
      if (c?.code) { await saveCourse(c); courses++; lastHit = Math.max(lastHit, batch[k]); }
    }
    id += batch.length;
    await sleep(PACE_MS);
  }
  return { ...meta, courses, scannedTo: id - 1, lastCourseId: lastHit };
}
