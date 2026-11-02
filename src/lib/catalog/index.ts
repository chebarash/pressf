import { cache } from "react";
import { shortName } from "./names";
import { db } from "@/lib/db";
import { catalogCache, lmsCourseTeachers, lmsCourses, lmsCurricula, lmsDepartments, lmsPrograms, lmsTeachers } from "@/lib/db/schema";
import type { Catalog, Course, Curriculum, School, Semesters, Teacher } from "./types";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-") || "x";

export * from "./types";

const empty = (): Catalog => ({
  teachers: [], courses: [], timetable: [], groups: [], schools: [], curricula: {},
  semesters: { current: null, next: null }, updatedAt: null,
});

/** Everything the bot API still provides (timetable, groups, schools, curricula, semesters). */
async function botCatalog(): Promise<Catalog> {
  const catalog = empty();
  for (const row of await db().select().from(catalogCache)) {
    if (row.key.startsWith("curriculum:")) {
      catalog.curricula[row.key.slice("curriculum:".length)] = row.data as Catalog["curricula"][string];
    } else if (row.key === "semesters") {
      catalog.semesters = row.data as Semesters;
    } else if (row.key in catalog) {
      Object.assign(catalog, { [row.key]: row.data });
    }
    const built = row.sourceUpdatedAt;
    if (built && (!catalog.updatedAt || built < catalog.updatedAt)) catalog.updatedAt = built;
  }
  return catalog;
}

/** Courses, teachers, schools and curricula built from the harvested LMS catalog. */
async function lmsCatalog() {
  const [courses, teachers, links, departments, progs, curricula] = await Promise.all([
    db().select().from(lmsCourses),
    db().select().from(lmsTeachers),
    db().select().from(lmsCourseTeachers),
    db().select().from(lmsDepartments),
    db().select().from(lmsPrograms),
    db().select().from(lmsCurricula),
  ]);
  if (!courses.length) return null;

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
    byCode.set(c.code, { code: c.code, subject: c.name, aliases: [], same_name_codes: [], teachers: teacherIds, classes: [] });
  }

  const deptFor = (teacherId: string) => {
    for (const c of courses) if (courseTeachers.get(c.id)?.has(teacherId)) return deptName.get(c.departmentId ?? "") ?? null;
    return null;
  };
  const builtTeachers: Teacher[] = teachers.map((t) => {
    const full = [t.firstName, t.surName].filter(Boolean).join(" ").trim() || t.id;
    return {
      id: t.id, name: full, display_name: full, previous_ids: [],
      position: null, department: deptFor(t.id), school: null, email: null,
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
          courses: s.courses.map((c) => ({ code: c.code ?? "", subject: c.name, credits: c.ects, type: "core" as const, elective_group: null, prerequisites: null })),
        })),
      };
    }
  }

  return { courses: [...byCode.values()], teachers: builtTeachers, schools: [...schoolMap.values()], curricula: builtCurricula };
}

/**
 * The catalog. Courses and teachers come from the LMS once it has been
 * harvested; timetable, groups, schools and curricula still come from the bot
 * until those move too. Before the first LMS harvest, everything falls back to
 * the bot so the site is never empty.
 */
export const getCatalog = cache(async (): Promise<Catalog> => {
  const [bot, lms] = await Promise.all([botCatalog(), lmsCatalog()]);
  if (lms) {
    bot.courses = lms.courses;
    bot.teachers = lms.teachers;
    // Schools and curricula come from the LMS too once programs are harvested;
    // until then keep the bot's so school and curriculum pages still work.
    if (lms.schools.length) bot.schools = lms.schools;
    if (Object.keys(lms.curricula).length) bot.curricula = lms.curricula;
  } else {
    bot.teachers = bot.teachers.map((teacher) => ({ ...teacher, display_name: shortName(teacher) }));
  }
  const names = new Map(bot.teachers.map((teacher) => [teacher.id, teacher.display_name]));
  bot.timetable = bot.timetable.map((lesson) => ({ ...lesson, teacher_name: names.get(lesson.teacher ?? "") ?? lesson.teacher_name }));
  return bot;
});

export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const findCourse = (catalog: Catalog, code: string): Course | undefined =>
  catalog.courses.find((course) => course.code === normalizeCode(code));

export const findTeacher = (catalog: Catalog, id: string): Teacher | undefined =>
  catalog.teachers.find((teacher) => teacher.id === id);

const DAY = 24 * 60 * 60 * 1000;

/** The bot builds daily, so two days old means something broke. */
export const isStale = (catalog: Catalog) =>
  !!catalog.updatedAt && Date.now() - catalog.updatedAt.getTime() > 2 * DAY;
