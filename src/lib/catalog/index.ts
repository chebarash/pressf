import { courseTitle } from "@/core/people";
import { cache } from "react";
import { db } from "@/lib/db";
import { lmsCourseTeachers, lmsCourses, lmsCurricula, lmsDepartments, lmsPrograms, lmsTeachers } from "@/lib/db/schema";
import type { Catalog, Course, Curriculum, School, Teacher } from "./types";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-") || "x";

export * from "./types";

/** The university catalog: courses, teachers, schools and curricula, built from the harvested LMS tables. */
async function buildCatalog(): Promise<Catalog> {
  const [courses, teachers, links, departments, progs, curricula] = await Promise.all([
    db().select().from(lmsCourses),
    db().select().from(lmsTeachers),
    db().select().from(lmsCourseTeachers),
    db().select().from(lmsDepartments),
    db().select().from(lmsPrograms),
    db().select().from(lmsCurricula),
  ]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const teaches = new Map<string, Set<string>>();
  const courseTeachers = new Map<string, Set<string>>();
  const codeOf = new Map(courses.map((c) => [c.id, c.code]));
  for (const link of links) {
    const code = codeOf.get(link.courseId);
    if (code) (teaches.get(link.teacherId) ?? teaches.set(link.teacherId, new Set()).get(link.teacherId)!).add(code);
    (courseTeachers.get(link.courseId) ?? courseTeachers.set(link.courseId, new Set()).get(link.courseId)!).add(link.teacherId);
  }

  const byCode = new Map<string, Course>();
  for (const c of courses) {
    const existing = byCode.get(c.code);
    const teacherIds = [...(courseTeachers.get(c.id) ?? [])];
    // Several LMS subject ids can share a code across terms; merge their teachers.
    if (existing) { existing.teachers = [...new Set([...existing.teachers, ...teacherIds])]; continue; }
    byCode.set(c.code, { code: c.code, subject: courseTitle(c.name), aliases: [], same_name_codes: [], teachers: teacherIds, classes: [] });
  }

  const deptFor = (teacherId: string) => {
    for (const c of courses) if (courseTeachers.get(c.id)?.has(teacherId)) return deptName.get(c.departmentId ?? "") ?? null;
    return null;
  };
  const builtTeachers: Teacher[] = teachers.map((t) => {
    const full = [t.firstName, t.surName].filter(Boolean).join(" ").trim() || t.id;
    return {
      id: t.id, name: full, display_name: full, previous_ids: [],
      position: t.position ?? null, department: deptFor(t.id), school: null, email: null,
      office: null, photo_url: null, url: null, teaches: [...(teaches.get(t.id) ?? [])],
    };
  });

  // Schools = the top department each program hangs under (walk parent_id up).
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const rootOf = (id: string | null): { id: string; name: string } | null => {
    const seen = new Set<string>();
    let d = id ? deptById.get(id) : undefined;
    while (d && d.parentId && deptById.has(d.parentId) && !seen.has(d.id)) { seen.add(d.id); d = deptById.get(d.parentId); }
    return d ? { id: d.id, name: d.name ?? "School" } : null;
  };

  // One curriculum per program: the harvested cohort plan with the most courses.
  const planByProgram = new Map<string, (typeof curricula)[number]>();
  for (const row of curricula) {
    if (!row.programId) continue;
    const best = planByProgram.get(row.programId);
    const size = (p?: (typeof curricula)[number]) => p?.data.semesters.reduce((n, s) => n + s.courses.length, 0) ?? 0;
    if (!best || size(row) > size(best)) planByProgram.set(row.programId, row);
  }

  const schoolMap = new Map<string, School>();
  const builtCurricula: Record<string, Curriculum> = {};
  for (const p of progs) {
    const pName = p.name ?? "Program";
    const slug = slugify(pName);
    const root = rootOf(p.departmentId ?? null) ?? { id: p.departmentId ?? slug, name: "School" };
    const schoolSlug = slugify(root.name);
    const school = schoolMap.get(schoolSlug) ?? { slug: schoolSlug, name: root.name, programs: [] };
    if (!school.programs.some((pr) => pr.slug === slug)) school.programs.push({ slug, name: pName, degree: "" });
    schoolMap.set(schoolSlug, school);

    const plan = planByProgram.get(p.id);
    if (plan) {
      builtCurricula[slug] = {
        program: slug, source_url: null, academic_year: null,
        semesters: plan.data.semesters.map((s, i) => ({
          number: i + 1, year: s.year ?? Math.ceil((i + 1) / 2), term: i % 2 === 0 ? "fall" : "spring",
          courses: s.courses.map((c) => ({ code: c.code ?? "", subject: courseTitle(c.name), credits: c.ects, type: "core" as const, elective_group: null, prerequisites: null })),
        })),
      };
    }
  }

  return { courses: [...byCode.values()], teachers: builtTeachers, schools: [...schoolMap.values()], curricula: builtCurricula };
}

// The catalog changes at most weekly (harvest), so it is built at most once per
// TTL for the whole server instead of scanning the tables on every request.
// `cache` still dedupes within a single request.
let snapshot: { at: number; data: Catalog } | undefined;
const CATALOG_TTL_MS = 5 * 60 * 1000;

const useSnapshot = process.env.NODE_ENV !== "test";

export const getCatalog = cache(async (): Promise<Catalog> => {
  if (useSnapshot && snapshot && Date.now() - snapshot.at < CATALOG_TTL_MS) return snapshot.data;
  const data = await buildCatalog();
  if (useSnapshot) snapshot = { at: Date.now(), data };
  return data;
});

export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
