import type { Catalog, Curriculum } from "@/lib/catalog";

type Semester = Curriculum["semesters"][number];
type PlanCourse = Semester["courses"][number];
export type LiveCourse = PlanCourse & { notRunning?: boolean };
export type LiveSemester = Omit<Semester, "courses"> & { courses: LiveCourse[]; live?: boolean };

/** Timetables use placeholders like "E" for electives, which are not real courses. */
const isCourseCode = (code: string | null): code is string => !!code && /^[A-Z]{2,}\s?\d{3}/.test(code);

export type TermRecord = { year: number; term: string; courses: Array<{ code: string; subject: string }> };

/** What the program's groups have in the timetable right now, by year of study. */
export function runningNow(slug: string, catalog: Pick<Catalog, "groups" | "timetable">, term: string): TermRecord[] {
  if (term !== "fall" && term !== "spring") return [];
  const years = [...new Set(catalog.groups.filter((group) => group.program === slug && group.year).map((group) => group.year!))];
  return years.flatMap((year) => {
    const classes = new Set(catalog.groups.filter((group) => group.program === slug && group.year === year).map((group) => group.class));
    const running = new Map(catalog.timetable.filter((lesson) => classes.has(lesson.class) && isCourseCode(lesson.code)).map((lesson) => [lesson.code as string, lesson.subject]));
    return running.size ? [{ year, term, courses: [...running].map(([code, subject]) => ({ code, subject })) }] : [];
  });
}

/**
 * Published plans lag behind what runs, so each term we have seen replaces the
 * plan for that semester. Planned required courses that did not run stay marked,
 * and a course that moved leaves the semester it was planned for.
 */
export function liveSemesters(plan: Curriculum | undefined, records: TermRecord[]): LiveSemester[] {
  const semesters: LiveSemester[] = (plan?.semesters ?? []).map((semester) => ({ ...semester, courses: [...semester.courses] }));
  const known = new Map(semesters.flatMap((semester) => semester.courses).map((course) => [course.code, course]));
  const targets = records.map((record) => {
    let semester = semesters.find((item) => item.year === record.year && item.term === record.term);
    if (!semester) {
      semester = { number: (record.year - 1) * 2 + (record.term === "fall" ? 1 : 2), year: record.year, term: record.term as Semester["term"], courses: [] };
      semesters.push(semester);
    }
    semester.live = true;
    return { record, semester };
  });
  const seen = new Set(records.flatMap((record) => record.courses.map((course) => course.code)));
  for (const semester of semesters) {
    if (!semester.live) semester.courses = semester.courses.filter((course) => !seen.has(course.code));
  }
  for (const { record, semester } of targets) {
    const running = new Set(record.courses.map((course) => course.code));
    const live = record.courses.map((course): LiveCourse => known.get(course.code) ?? { ...course, credits: null, type: "core", elective_group: null, prerequisites: null });
    const idle = semester.courses.filter((course) => !running.has(course.code));
    semester.courses = [...live, ...idle.map((course) => (course.type === "core" ? { ...course, notRunning: true } : course))];
  }
  return semesters.filter((semester) => semester.courses.length > 0).sort((a, b) => a.number - b.number);
}

/** The stored terms, with the current one taken fresh from the timetable. */
export const mergeRecords = (stored: TermRecord[], current: TermRecord[]) => [
  ...stored.filter((record) => !current.some((item) => item.year === record.year && item.term === record.term)),
  ...current,
];
