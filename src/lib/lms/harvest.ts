import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { plainText } from "@/core/notifications";
import { localized } from "@/core/people";
import { lmsCourseTeachers, lmsCourses, lmsCurricula, lmsDepartments, lmsPrograms, lmsTeachers, type LmsCurriculumData, type LmsTeacherEducation, type LmsTeacherPublication } from "@/lib/db/schema";
import { departments, employee, individualPlan, programs, subject, type LmsSession } from "@/lib/lms/client";
import { harvestSemesters, listOf, pick } from "@/lib/lms/semesters";
import { activeAccountIds, harvestSession, sessionFor } from "@/lib/lms/store";
import type { LmsEmployee, LmsEmployeeDetail, LmsIepRow, LmsSubject } from "@/lib/lms/types";
import { invalidateHarvest } from "@/server/views/cache";

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
/** One name part, English first (`first` given, `sur` family, `last` patronymic: see core/people). */
const name = (e: LmsEmployee, part: "first" | "last" | "sur") => localized(e as Record<string, unknown>, `${part}_name`);

/**
 * Who teaches what in a course. `/subject/get-by-id` sends `employee[]` without
 * a role, but every lesson carries its type (`lessonType.name`: "Lecture",
 * "Tutorial", "Laboratory") and the teacher of each scheduled slot, so the role
 * comes from the lessons; `employee_type` (sent by `/subject/my-list`) is used
 * when the lessons say nothing.
 */
export function courseRoles(c: Pick<LmsSubject, "employee" | "lessons">): Array<{ teacherId: string; role: string | null }> {
  const out = new Map<string, { teacherId: string; role: string | null }>();
  for (const l of c.lessons ?? []) {
    const role = l.lessonType?.name?.trim() || null;
    for (const s of l.schedule ?? []) {
      const id = String(s.employee_id ?? s.employee?.employee_id ?? "").trim();
      if (id && role) out.set(`${id}|${role}`, { teacherId: id, role });
    }
  }
  for (const e of c.employee ?? []) {
    if (!e.employee_id || [...out.values()].some((r) => r.teacherId === e.employee_id)) continue;
    const role = e.employee_type && !/^other/i.test(e.employee_type) ? e.employee_type : null;
    out.set(`${e.employee_id}|${role}`, { teacherId: e.employee_id, role });
  }
  return [...out.values()];
}

async function saveDepartmentsAndPrograms(session: LmsSession) {
  const [deps, progs] = await Promise.all([departments(session), programs(session)]);
  // Postgres rejects a batch upsert that touches the same id twice, and the LMS
  // can return duplicate ids, so keep the last row per id.
  const uniqueById = <T extends { id: string }>(rows: T[]) => [...new Map(rows.filter((r) => r.id).map((r) => [r.id, r])).values()];
  const depRows = uniqueById(deps);
  const progRows = uniqueById(progs);
  if (depRows.length) {
    await db().insert(lmsDepartments).values(
      depRows.map((d) => ({ id: d.id, code: d.code ?? null, parentId: d.parent_id ?? null, typeId: d.department_type_id ?? null, name: d.name, shortName: d.short_name ?? null }))
    ).onConflictDoUpdate({
      target: lmsDepartments.id,
      set: { code: sql`excluded.code`, parentId: sql`excluded.parent_id`, typeId: sql`excluded.type_id`, name: sql`excluded.name`, shortName: sql`excluded.short_name` },
    });
  }
  if (progRows.length) {
    await db().insert(lmsPrograms).values(
      progRows.map((p) => ({ id: p.id, name: p.name, departmentId: p.department_id ?? null, groupId: p.education_program_group_id ?? null, description: p.description ?? null }))
    ).onConflictDoUpdate({
      target: lmsPrograms.id,
      set: { name: sql`excluded.name`, departmentId: sql`excluded.department_id`, groupId: sql`excluded.group_id`, description: sql`excluded.description` },
    });
  }
  return { departments: depRows.length, programs: progRows.length };
}

async function saveCourse(c: LmsSubject) {
  await db().insert(lmsCourses).values({
    id: c.id, code: c.code, name: c.name ?? c.code,
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
  const links = courseRoles(c).filter((l) => seen.has(l.teacherId)).map((l) => ({ courseId: c.id, ...l }));
  if (links.length) await db().insert(lmsCourseTeachers).values(links).onConflictDoNothing();
}

/**
 * Build a cohort curriculum from one student's plan and store it, keyed by the
 * work-education-plan id (one plan per entry year). Each sign-in fills in more
 * cohorts. Stored only when it has courses, so an empty plan never wipes a good one.
 */
export async function harvestCurriculum(session: LmsSession) {
  let rows: LmsIepRow[];
  try {
    rows = await individualPlan(session);
  } catch {
    return { curricula: 0 };
  }
  const byPlan = new Map<string, { programId: string | null; learnerId: string | null; data: LmsCurriculumData }>();
  for (const row of rows ?? []) {
    const wep = row.work_education_plan_id;
    if (!wep) continue;
    const entry = byPlan.get(wep) ?? { programId: row.education_program_id ?? null, learnerId: null, data: { programId: row.education_program_id ?? null, semesters: [] } };
    const courses = (row.subjects ?? [])
      .filter((s) => s.name)
      .map((s) => ({ id: s.subject_id ?? s.id ?? "", code: s.code ?? null, name: (s.name ?? "").trim(), ects: s.ects != null && s.ects !== "" ? Number(s.ects) : null }));
    if (courses.length) entry.data.semesters.push({ semesterId: row.semester_id ?? "", year: row.year_of_study != null && row.year_of_study !== "" ? Number(row.year_of_study) : null, courses });
    byPlan.set(wep, entry);
  }
  let saved = 0;
  for (const [wep, { programId, data }] of byPlan) {
    if (!data.semesters.length) continue;
    data.semesters.sort((a, b) => Number(a.semesterId) - Number(b.semesterId));
    await db().insert(lmsCurricula).values({ workEducationPlanId: wep, programId, data, updatedAt: new Date() })
      .onConflictDoUpdate({ target: lmsCurricula.workEducationPlanId, set: { programId: sql`excluded.program_id`, data: sql`excluded.data`, updatedAt: sql`excluded.updated_at` } });
    saved++;
  }
  return { curricula: saved };
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
      if (!c?.code) continue;
      // A real subject id: keep scanning past it. Skip deleted/nameless records,
      // which the LMS still returns under a used id.
      lastHit = Math.max(lastHit, batch[k]);
      if (c.deleted === "1" || !c.name) continue;
      await saveCourse(c); courses++;
    }
    id += batch.length;
    await sleep(PACE_MS);
  }
  return { ...meta, courses, scannedTo: id - 1, lastCourseId: lastHit };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const yearIn = (s: string | null) => s?.match(/\b(19|20)\d\d\b/)?.[0] ?? null;

/** A list field that may come as an array, a `{ data: [] }` wrapper, or one HTML/plain string. */
function entries(v: unknown): Array<Obj | string> {
  if (Array.isArray(v)) return v.filter((x): x is Obj | string => isObj(x) || (typeof x === "string" && !!x.trim()));
  if (isObj(v)) return listOf(v).length ? listOf(v) : [v];
  if (typeof v === "string") return plainText(v).split(/\n+/).map((x) => x.replace(/^•\s*/, "").trim()).filter(Boolean);
  return [];
}

function educationOf(v: unknown): LmsTeacherEducation[] {
  return entries(v).map((e) => {
    if (typeof e === "string") return { degree: null, field: null, institution: e, year: yearIn(e) };
    const year = pick(e, ["end_year", "graduation_year", "year_end", "year", "date_end", "end_date", "finish_date", "finish_year"]);
    return {
      degree: pick(e, ["degree", "academic_degree", "degree_name", "academicDegree", "qualification", "education_level", "level", "educationType", "education_type"]),
      field: pick(e, ["specialty", "speciality", "specialization", "direction", "faculty", "field"]),
      institution: pick(e, ["university_name", "university", "institution", "educational_institution", "organization", "school", "place", "name"]),
      year: yearIn(year) ?? year,
    };
  }).filter((e) => e.degree || e.field || e.institution);
}

function publicationsOf(v: unknown): LmsTeacherPublication[] {
  return entries(v).map((p) => {
    if (typeof p === "string") return { title: p, year: yearIn(p), venue: null, url: null };
    const year = pick(p, ["year", "publish_year", "publication_year", "date", "published_at", "publish_date"]);
    return {
      title: pick(p, ["title", "name", "publication_name", "theme", "topic"]) ?? "",
      year: yearIn(year) ?? year,
      venue: pick(p, ["journal", "publisher", "source", "magazine", "conference", "edition", "publication"]),
      url: pick(p, ["url", "link", "doi"]),
    };
  }).filter((p) => p.title);
}

/** The deepest named unit of `departmentTree` (school → department). */
function departmentOf(v: unknown): string | null {
  if (Array.isArray(v)) {
    for (const x of [...v].reverse()) {
      const d = departmentOf(x);
      if (d) return d;
    }
    return null;
  }
  if (!isObj(v)) return typeof v === "string" && v.trim() ? v.trim() : null;
  const child = departmentOf(v.children ?? v.child ?? v.department ?? v.sub ?? null);
  return child ?? pick(v, ["name_en", "name", "title"]);
}

/** What Press F keeps from `/employee/get-by-id`. Never `imagesUrls`: no real photos. */
export function teacherProfile(detail: LmsEmployeeDetail | null) {
  return {
    position: detail?.academicStatus?.name?.trim() || null,
    department: departmentOf(detail?.departmentTree ?? null),
    education: educationOf(detail?.education),
    publications: publicationsOf(detail?.publications),
    scienceDirection: (typeof detail?.science_direction === "string" && plainText(detail.science_direction)) || null,
  };
}

/**
 * Enriches stored teachers with their LMS profile: position (`academicStatus`),
 * department, education, publications and research area. Paced like the course
 * walk; one failing teacher never aborts the rest. (The LMS has no email, and
 * the real photo is deliberately ignored — Press F only shows Notion Faces.)
 */
export async function harvestTeacherDetails(session: LmsSession) {
  const rows = await db().select({ id: lmsTeachers.id }).from(lmsTeachers);
  let updated = 0;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async ({ id }) => {
      try {
        const detail = await employee(session, id);
        await db().update(lmsTeachers).set(teacherProfile(detail)).where(sql`${lmsTeachers.id} = ${id}`);
        updated++;
      } catch {
        // One teacher's failed fetch must not abort the rest.
      }
    }));
    await sleep(PACE_MS);
  }
  return { teacherDetails: updated };
}

/**
 * A full run: the shared catalog once, then each saved student's curriculum so
 * cohorts fill in, then every teacher's profile detail. One account failing
 * never stops the rest.
 */
export async function harvestAll(opts: { maxId?: number; stopGap?: number } = {}) {
  const session = await harvestSession();
  if (!session) return { error: "no_lms_account" as const };
  const catalog = await harvestCatalog(session, opts);
  let curricula = 0;
  for (const userId of await activeAccountIds()) {
    const s = await sessionFor(userId).catch(() => null);
    if (!s) continue;
    curricula += (await harvestCurriculum(s).catch(() => ({ curricula: 0 }))).curricula;
  }
  const { teacherDetails } = await harvestTeacherDetails(session).catch(() => ({ teacherDetails: 0 }));
  const semesters = await harvestSemesters(session).catch(() => ({ semesters: 0, calendars: 0 }));
  // Public pages (courses, professors, curricula) refresh on the next visit.
  invalidateHarvest();
  return { ...catalog, curricula, teacherDetails, ...semesters };
}
