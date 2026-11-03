/**
 * Admin coverage report: Postgres only (never the LMS), cached for a minute.
 * Counts only: nothing here names a student.
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { coverageReport, type CoverageInput, type CoverageReport } from "@/core/coverage";
import { isMoveTarget } from "@/core/placement";
import { localDay } from "@/core/time";
import { db } from "@/lib/db";
import { coursePlacements, type LmsCurriculumData } from "@/lib/db/schema";
import { audit } from "@/server/audit";
import { termName } from "@/server/sync/types";
import { invalidate, publicCache, TAGS } from "@/server/views/cache";
import { authorize } from "./access";
import { AdminError } from "./ops";

type Row = Record<string, unknown>;
const rows = (r: unknown) => ((r as { rows?: Row[] }).rows ?? (r as Row[])) as Row[];
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string).toISOString());

const arr = (path: ReturnType<typeof sql>) => sql`case when jsonb_typeof(${path}) = 'array' then ${path} else '[]'::jsonb end`;

/** Catalog, cohort plans and materials per course code, in one round trip. */
async function catalogAndMaterials() {
  const r = await db().execute(sql`
    with files as (
      select upper(code) as code, count(*)::int as n, max(coalesce(lms_updated_at, lms_created_at, fetched_at)) as last
      from lms_files group by 1
    ), ups as (
      select upper(coalesce(u.course_code, c.code)) as code, count(*)::int as n,
        (count(*) filter (where u.type in ('exam', 'mock')))::int as exams, max(coalesce(u.reviewed_at, u.created_at)) as last
      from uploads u left join lms_courses c on c.id = u.course_id
      where u.status = 'live' and coalesce(u.course_code, c.code) is not null group by 1
    ), syl as (
      select distinct upper(course_code) as code from syllabi where matched
    ), codes as (
      select code from files union select code from ups union select code from syl
    )
    select
      (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'starts', starts, 'ends', ends)), '[]') from lms_semesters) as semesters,
      (select coalesce(json_agg(json_build_object('id', id, 'parentId', parent_id, 'name', coalesce(nullif(trim(name), ''), nullif(trim(short_name), '')))), '[]') from lms_departments) as departments,
      (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'departmentId', department_id)), '[]') from lms_programs) as programs,
      (select coalesce(json_agg(json_build_object('id', work_education_plan_id, 'programId', program_id, 'data', data)), '[]') from lms_curricula) as plans,
      (select coalesce(json_agg(json_build_object('id', id, 'code', code, 'name', name, 'departmentId', department_id, 'semesterId', semester_id, 'departmentName', raw->'department'->>'name')), '[]') from lms_courses) as courses,
      (select coalesce(json_agg(json_build_object(
        'code', k.code, 'lmsFiles', coalesce(f.n, 0), 'uploads', coalesce(u.n, 0), 'exams', coalesce(u.exams, 0),
        'syllabus', s.code is not null, 'lastFile', greatest(f.last, u.last))), '[]')
        from codes k left join files f on f.code = k.code left join ups u on u.code = k.code left join syl s on s.code = k.code) as materials,
      (select count(*)::int from lms_accounts where status = 'active') as active,
      (select coalesce(json_agg(json_build_object('code', course_code, 'school', school, 'department', department)), '[]') from course_placements) as placements,
      -- Who teaches each course, with the department an admin set on the professor, else the faculty site's.
      (select coalesce(json_agg(json_build_object('courseId', t.course_id, 'role', t.role, 'department', t.department, 'school', t.school)), '[]') from (
        select distinct ct.course_id, ct.teacher_id, ct.role,
          coalesce(o.department, fp.department) as department, coalesce(o.school, fp.school) as school
        from lms_course_teachers ct
        left join teacher_aliases a on a.old_id = ct.teacher_id
        left join teacher_overrides o on o.teacher_id = coalesce(a.teacher_id, ct.teacher_id)
        left join lateral (
          select p.department, p.school from faculty_people p
          where p.teacher_id = coalesce(a.teacher_id, ct.teacher_id) and p.match <> 'dismissed'
          order by (p.department is null), p.site_id limit 1
        ) fp on true
        where coalesce(o.department, fp.department, o.school, fp.school) is not null
      ) t) as teachers
  `);
  const row = rows(r)[0] ?? {};
  const parse = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
  const plans = parse<Array<{ id: string; programId: string | null; data: LmsCurriculumData }>>(row.plans);
  return {
    semesters: parse<CoverageInput["semesters"]>(row.semesters).map((s) => ({ ...s, id: String(s.id) })),
    departments: parse<CoverageInput["departments"]>(row.departments).map((d) => ({ ...d, id: String(d.id), parentId: str(d.parentId) })),
    programs: parse<CoverageInput["programs"]>(row.programs).map((p) => ({ ...p, id: String(p.id), departmentId: str(p.departmentId) })),
    plans: plans.map((p) => ({ id: p.id, programId: str(p.programId), semesters: (p.data?.semesters ?? []).map((s) => ({ semesterId: String(s.semesterId), year: s.year ?? null, courses: s.courses ?? [] })) })),
    courses: parse<CoverageInput["courses"]>(row.courses).map((c) => ({ ...c, id: String(c.id), departmentId: str(c.departmentId), semesterId: str(c.semesterId) })),
    materials: parse<CoverageInput["materials"]>(row.materials).map((m) => ({ ...m, lastFile: iso(m.lastFile) })),
    activeAccounts: Number(row.active ?? 0),
    placements: parse<NonNullable<CoverageInput["placements"]>>(row.placements),
    teachers: parse<NonNullable<CoverageInput["teachers"]>>(row.teachers).map((t) => ({ ...t, courseId: String(t.courseId) })),
  };
}

/**
 * What active students take now: courses of the open semester in their synced
 * snapshot, plus the codes of their sign-in enrollment.
 */
async function enrollments(): Promise<CoverageInput["enrollments"]> {
  const courses = sql`${sql.raw("us.snapshot")}->'lms'->'courses'`;
  const semesters = sql`${sql.raw("us.snapshot")}->'lms'->'semesters'`;
  const codes = sql`${sql.raw("lc.data")}->'enrollment'->'codes'`;
  const r = await db().execute(sql`
    select a.user_id::text as uid, c->>'subjectId' as course_id, null as code, c->>'semesterId' as semester_id
    from lms_accounts a
    join user_state us on us.user_id = a.user_id
    cross join lateral jsonb_array_elements(${arr(courses)}) c
    where a.status = 'active'
      and exists (select 1 from jsonb_array_elements(${arr(semesters)}) s where s->>'id' = c->>'semesterId' and s->>'open' = 'true')
    union all
    select a.user_id::text, null, code, null
    from lms_accounts a
    join lms_cache lc on lc.user_id = a.user_id
    cross join lateral jsonb_array_elements_text(${arr(codes)}) code
    where a.status = 'active'
  `);
  return rows(r).map((x) => ({ userId: String(x.uid), courseId: str(x.course_id), code: str(x.code), semesterId: str(x.semester_id) }));
}

export async function coverageNow(now = new Date()): Promise<CoverageReport> {
  const [catalog, enrolled] = await Promise.all([catalogAndMaterials(), enrollments()]);
  const report = coverageReport({ ...catalog, enrollments: enrolled, today: localDay(now) });
  const name = report.semester.name ? termName(report.semester.name) || report.semester.name : null;
  return { ...report, semester: { ...report.semester, name } };
}

export const COVERAGE_TAG = "admin-coverage";

/** The report, shared by staff for a minute. */
export const coverage = publicCache("admin-coverage", () => coverageNow(), () => [TAGS.catalog, COVERAGE_TAG], 60);

const moveSchema = z.object({
  code: z.string().trim().min(1).max(40).transform((c) => c.toUpperCase()),
  school: z.string().max(120).nullable(),
  department: z.string().max(120).nullable(),
});

/**
 * An admin moves a course to a school (and department) on the Coverage page;
 * the move wins over the LMS, the teachers and the code. A null school drops
 * the move, so the course is placed automatically again. Audited.
 */
export async function moveCourse(actorId: string, input: { code: string; school: string | null; department: string | null }) {
  await authorize(actorId, "admin:catalog");
  const { code, school, department } = moveSchema.parse(input);
  const [before] = await db().select().from(coursePlacements).where(eq(coursePlacements.courseCode, code));
  const from = before ? { school: before.school, department: before.department } : null;
  if (!school) {
    if (!before) return { message: "Already placed automatically" };
    await db().delete(coursePlacements).where(eq(coursePlacements.courseCode, code));
    await audit(actorId, "course.placement.reset", `course:${code}`, { from });
  } else {
    if (!isMoveTarget(school, department)) throw new AdminError("Pick a school and department from the list");
    if (before && before.school === school && before.department === department) return { message: "Nothing changed" };
    const now = new Date();
    await db()
      .insert(coursePlacements)
      .values({ courseCode: code, school, department, updatedBy: actorId, updatedAt: now })
      .onConflictDoUpdate({ target: coursePlacements.courseCode, set: { school, department, updatedBy: actorId, updatedAt: now } });
    await audit(actorId, "course.placement", `course:${code}`, { from, to: { school, department } });
  }
  invalidate(COVERAGE_TAG);
  return { message: school ? `${code} moved` : `${code} placed automatically again` };
}
