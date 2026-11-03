/**
 * Coverage: which courses running this semester Press F can fill.
 *
 * The LMS hands lessons, files and syllabi of a course only to an account
 * enrolled in it, so a course is "covered" when at least one active Press F
 * student takes it this semester. Everything else waits for someone from that
 * cohort to sign in. Pure: the admin view feeds it rows from Postgres.
 */

export type CoverageInput = {
  /** Local day, YYYY-MM-DD. */
  today: string;
  semesters: Array<{ id: string; name: string | null; starts: string | null; ends: string | null }>;
  departments: Array<{ id: string; parentId: string | null; name: string | null }>;
  programs: Array<{ id: string; name: string | null; departmentId: string | null }>;
  /** Harvested LMS courses (one row per LMS subject id). */
  courses: Array<{ id: string; code: string; name: string; departmentId: string | null; semesterId: string | null }>;
  /** Materials per course code (any offering). */
  materials: Array<{ code: string; lmsFiles: number; uploads: number; exams: number; syllabus: boolean; lastFile: string | null }>;
  /** Cohort plans (lms_curricula). */
  plans: Array<{ id: string; programId: string | null; semesters: Array<{ semesterId: string; year: number | null; courses: Array<{ id: string; code: string | null; name: string }> }> }>;
  /**
   * What active students take: a course from their synced snapshot (subject id
   * and the open semester it is in), or a code from their sign-in enrollment.
   */
  enrollments: Array<{ userId: string; courseId: string | null; code: string | null; semesterId: string | null }>;
  /** Saved LMS logins that still work. */
  activeAccounts: number;
};

export type CohortRef = { programId: string; program: string; year: number | null };

export type CoverageCourse = {
  code: string;
  name: string;
  faculty: string;
  school: string;
  department: string;
  cohorts: CohortRef[];
  /** Active students enrolled this semester. */
  students: number;
  covered: boolean;
  lmsFiles: number;
  uploads: number;
  exams: number;
  syllabus: boolean;
  lastFile: string | null;
};

export type CoverageUnit = {
  key: string;
  name: string;
  running: number;
  covered: number;
  pct: number;
  students: number;
  /** Codes of the courses no active student takes yet. */
  uncovered: string[];
};

export type CoverageFaculty = CoverageUnit & {
  schools: Array<CoverageUnit & { departments: CoverageUnit[] }>;
  materials: ReturnType<typeof materialTotals>;
};

export type Suggestion = {
  programId: string;
  program: string;
  /** Top unit (faculty) of the program. */
  faculty: string;
  year: number | null;
  /** Courses of this cohort running now. */
  total: number;
  /** Not covered yet (before earlier suggestions). */
  uncovered: number;
  /** Newly covered if one student of this cohort signs in, after the earlier suggestions. */
  gain: number;
  courses: Array<{ code: string; name: string }>;
};

export type CoverageReport = {
  semester: { id: string | null; name: string | null };
  totals: { running: number; covered: number; pct: number; students: number; activeAccounts: number; noFiles: number; lmsOnly: number; noCohort: number };
  faculties: CoverageFaculty[];
  suggestions: Suggestion[];
  courses: CoverageCourse[];
  programs: Array<{ id: string; name: string }>;
  years: number[];
};

/** Materials summed over a set of courses. */
export const materialTotals = (list: CoverageCourse[]) => ({
  courses: list.length,
  lmsFiles: list.reduce((n, c) => n + c.lmsFiles, 0),
  uploads: list.reduce((n, c) => n + c.uploads, 0),
  exams: list.reduce((n, c) => n + c.exams, 0),
  syllabi: list.filter((c) => c.syllabus).length,
  noFiles: list.filter((c) => !c.lmsFiles && !c.uploads).length,
  lmsOnly: list.filter((c) => c.lmsFiles > 0 && !c.uploads).length,
});

const up = (code: string) => code.trim().toUpperCase();
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const num = (id: string) => (Number.isFinite(Number(id)) ? Number(id) : -1);

/**
 * The semester to report on: the one most active students have open in their
 * synced LMS data; else the one whose dates hold today; else the newest one
 * harvested courses carry.
 */
export function currentSemester(input: Pick<CoverageInput, "today" | "semesters" | "courses" | "enrollments">): string | null {
  const votes = new Map<string, Set<string>>();
  for (const e of input.enrollments) if (e.semesterId && e.courseId) votes.set(e.semesterId, (votes.get(e.semesterId) ?? new Set()).add(e.userId));
  const voted = [...votes].sort((a, b) => b[1].size - a[1].size || num(b[0]) - num(a[0]))[0];
  if (voted) return voted[0];
  const dated = input.semesters.filter((s) => s.starts && s.ends && s.starts <= input.today && input.today <= s.ends).sort((a, b) => (b.starts ?? "").localeCompare(a.starts ?? ""))[0];
  if (dated) return dated.id;
  const ids = [...new Set(input.courses.map((c) => c.semesterId).filter((s): s is string => !!s))].sort((a, b) => num(b) - num(a));
  return ids[0] ?? null;
}

/** Department names from the top (faculty) down to `id`. A lone university-wide root is dropped. */
function chains(departments: CoverageInput["departments"]) {
  const byId = new Map(departments.map((d) => [d.id, d]));
  const roots = departments.filter((d) => !d.parentId || !byId.has(d.parentId));
  const dropRoot = roots.length === 1 && departments.some((d) => d.parentId === roots[0].id);
  const memo = new Map<string, string[]>();
  return (id: string | null): string[] => {
    if (!id || !byId.has(id)) return [];
    const hit = memo.get(id);
    if (hit) return hit;
    const path: string[] = [];
    const seen = new Set<string>();
    let d = byId.get(id);
    while (d && !seen.has(d.id)) {
      seen.add(d.id);
      path.unshift(d.id);
      d = d.parentId ? byId.get(d.parentId) : undefined;
    }
    const out = (dropRoot && path.length > 1 ? path.slice(1) : path).map((x) => byId.get(x)?.name?.trim() || "Department");
    memo.set(id, out);
    return out;
  };
}

/**
 * Greedy recruiting order: each step picks the cohort (program + year of study)
 * whose one new student would cover the most still-uncovered courses.
 */
export function suggest(cohorts: Array<Omit<Suggestion, "gain" | "uncovered" | "courses"> & { codes: string[] }>, covered: Set<string>, names: Map<string, string>): Suggestion[] {
  const done = new Set(covered);
  const left = cohorts.map((c) => ({ ...c, uncovered: c.codes.filter((x) => !covered.has(x)).length }));
  const out: Suggestion[] = [];
  for (;;) {
    let best: (typeof left)[number] | null = null;
    let bestGain = 0;
    for (const c of left) {
      const gain = c.codes.filter((x) => !done.has(x)).length;
      if (gain > bestGain || (gain === bestGain && gain > 0 && best && (c.uncovered > best.uncovered || (c.uncovered === best.uncovered && c.program.localeCompare(best.program) < 0)))) {
        best = c;
        bestGain = gain;
      }
    }
    if (!best || bestGain === 0) break;
    const fresh = best.codes.filter((x) => !done.has(x));
    for (const x of fresh) done.add(x);
    out.push({ programId: best.programId, program: best.program, faculty: best.faculty, year: best.year, total: best.total, uncovered: best.uncovered, gain: fresh.length, courses: fresh.map((code) => ({ code, name: names.get(code) ?? code })) });
    left.splice(left.indexOf(best), 1);
  }
  return out;
}

export function coverageReport(input: CoverageInput): CoverageReport {
  const semesterId = currentSemester(input);
  const semester = input.semesters.find((s) => s.id === semesterId);
  const chainOf = chains(input.departments);
  const programs = new Map(input.programs.map((p) => [p.id, p]));
  const codeOfId = new Map(input.courses.map((c) => [c.id, up(c.code)]));

  // Courses running now, one per code.
  type Running = { code: string; name: string; departmentId: string | null; ids: Set<string>; cohorts: Map<string, CohortRef> };
  const running = new Map<string, Running>();
  const add = (code: string, name: string, departmentId: string | null, id: string | null) => {
    const r = running.get(code) ?? { code, name, departmentId, ids: new Set<string>(), cohorts: new Map() };
    if (!r.departmentId && departmentId) r.departmentId = departmentId;
    if (id) r.ids.add(id);
    running.set(code, r);
    return r;
  };
  if (semesterId) for (const c of input.courses) if (c.semesterId === semesterId && c.code) add(up(c.code), c.name, c.departmentId, c.id);

  // Cohort plans: which program and year of study takes each running course.
  const cohorts = new Map<string, { programId: string; program: string; faculty: string; year: number | null; departmentId: string | null; codes: Set<string> }>();
  for (const plan of input.plans) {
    if (!plan.programId) continue;
    const program = programs.get(plan.programId);
    for (const s of plan.semesters) {
      if (s.semesterId !== semesterId) continue;
      const key = `${plan.programId}|${s.year ?? "?"}`;
      const chain = chainOf(program?.departmentId ?? null);
      const cohort = cohorts.get(key) ?? { programId: plan.programId, program: program?.name?.trim() || "Program", faculty: chain[0] ?? "Other", year: s.year, departmentId: program?.departmentId ?? null, codes: new Set<string>() };
      for (const c of s.courses) {
        const code = c.code ? up(c.code) : codeOfId.get(c.id);
        if (!code) continue;
        const r = add(code, running.get(code)?.name ?? c.name, null, c.id || null);
        r.cohorts.set(key, { programId: cohort.programId, program: cohort.program, year: cohort.year });
        cohort.codes.add(code);
      }
      cohorts.set(key, cohort);
    }
  }
  // A course with no department of its own sits under its first cohort's program.
  for (const r of running.values()) {
    if (r.departmentId) continue;
    const first = [...r.cohorts.keys()][0];
    r.departmentId = first ? cohorts.get(first)?.departmentId ?? null : null;
  }

  // Who takes what now.
  const students = new Map<string, Set<string>>();
  for (const e of input.enrollments) {
    let code: string | undefined;
    if (e.courseId) {
      if (semesterId && e.semesterId && e.semesterId !== semesterId) continue;
      code = codeOfId.get(e.courseId);
    } else if (e.code) code = up(e.code);
    if (!code || !running.has(code)) continue;
    students.set(code, (students.get(code) ?? new Set()).add(e.userId));
  }
  const coveredCodes = new Set([...students.keys()]);

  const mats = new Map(input.materials.map((m) => [up(m.code), m]));
  const courses: CoverageCourse[] = [...running.values()]
    .map((r) => {
      const chain = chainOf(r.departmentId);
      const m = mats.get(r.code);
      return {
        code: r.code,
        name: r.name,
        faculty: chain[0] ?? "Unassigned",
        school: chain[1] ?? chain[0] ?? "Unassigned",
        department: chain[chain.length - 1] ?? "Unassigned",
        cohorts: [...r.cohorts.values()].sort((a, b) => (a.year ?? 99) - (b.year ?? 99) || a.program.localeCompare(b.program)),
        students: students.get(r.code)?.size ?? 0,
        covered: coveredCodes.has(r.code),
        lmsFiles: m?.lmsFiles ?? 0,
        uploads: m?.uploads ?? 0,
        exams: m?.exams ?? 0,
        syllabus: m?.syllabus ?? false,
        lastFile: m?.lastFile ?? null,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const unit = (key: string, name: string, list: CoverageCourse[]): CoverageUnit => {
    const covered = list.filter((c) => c.covered).length;
    const who = new Set<string>();
    for (const c of list) for (const u of students.get(c.code) ?? []) who.add(u);
    return { key, name, running: list.length, covered, pct: pct(covered, list.length), students: who.size, uncovered: list.filter((c) => !c.covered).map((c) => c.code) };
  };
  const groupBy = <K extends keyof CoverageCourse>(list: CoverageCourse[], k: K) => {
    const m = new Map<string, CoverageCourse[]>();
    for (const c of list) m.set(String(c[k]), [...(m.get(String(c[k])) ?? []), c]);
    return [...m];
  };
  // Least covered first: that is where students are missing.
  const order = (a: CoverageUnit, b: CoverageUnit) => a.pct - b.pct || b.running - a.running || a.name.localeCompare(b.name);
  const faculties: CoverageFaculty[] = groupBy(courses, "faculty")
    .map(([name, list]) => ({
      ...unit(name, name, list),
      schools: groupBy(list, "school")
        .map(([school, sl]) => ({ ...unit(`${name}|${school}`, school, sl), departments: groupBy(sl, "department").map(([d, dl]) => unit(`${name}|${school}|${d}`, d, dl)).sort(order) }))
        .sort(order),
      materials: materialTotals(list),
    }))
    .sort(order);

  const names = new Map(courses.map((c) => [c.code, c.name]));
  const suggestions = suggest(
    [...cohorts.values()].map((c) => ({ programId: c.programId, program: c.program, faculty: c.faculty, year: c.year, total: c.codes.size, codes: [...c.codes].sort() })),
    coveredCodes,
    names,
  );

  const everyone = new Set<string>();
  for (const s of students.values()) for (const u of s) everyone.add(u);
  const covered = courses.filter((c) => c.covered).length;
  const programList = [...new Map(courses.flatMap((c) => c.cohorts.map((h) => [h.programId, { id: h.programId, name: h.program }] as const))).values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    semester: { id: semesterId, name: semester?.name ?? null },
    totals: {
      running: courses.length,
      covered,
      pct: pct(covered, courses.length),
      students: everyone.size,
      activeAccounts: input.activeAccounts,
      noFiles: courses.filter((c) => !c.lmsFiles && !c.uploads).length,
      lmsOnly: courses.filter((c) => c.lmsFiles > 0 && !c.uploads).length,
      noCohort: courses.filter((c) => !c.covered && !c.cohorts.length).length,
    },
    faculties,
    suggestions,
    courses,
    programs: programList,
    years: [...new Set(courses.flatMap((c) => c.cohorts.map((h) => h.year)).filter((y): y is number => y !== null))].sort((a, b) => a - b),
  };
}

/** "Year 2 · Mechanical Engineering" */
export const cohortLabel = (c: { program: string; year: number | null }) => (c.year ? `Year ${c.year} · ${c.program}` : c.program);

const cell = (v: string | number | boolean | null) => {
  const s = v === null ? "" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: Array<Array<string | number | boolean | null>>) => rows.map((r) => r.map(cell).join(",")).join("\n");

/** One row per running course: where it sits, who takes it, covered or not. */
export const coverageCsv = (r: CoverageReport) =>
  toCsv([
    ["faculty", "school", "department", "code", "course", "cohorts", "students", "covered"],
    ...r.courses.map((c) => [c.faculty, c.school, c.department, c.code, c.name, c.cohorts.map(cohortLabel).join("; "), c.students, c.covered]),
  ]);

/** One row per running course: what materials it has. */
export const materialsCsv = (r: CoverageReport) =>
  toCsv([
    ["faculty", "school", "code", "course", "cohorts", "lms_files", "student_uploads", "past_exams", "syllabus", "last_file"],
    ...r.courses.map((c) => [c.faculty, c.school, c.code, c.name, c.cohorts.map(cohortLabel).join("; "), c.lmsFiles, c.uploads, c.exams, c.syllabus, c.lastFile ? c.lastFile.slice(0, 10) : null]),
  ]);
