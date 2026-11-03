/**
 * Where a course sits: school → department. The university's own structure
 * (interactive.newuu.uz/faculty) is the frame; LMS department labels, the
 * departments of a course's teachers and course-code prefixes are mapped onto
 * it. Pure: the coverage report feeds it rows from Postgres.
 *
 * Precedence for a course: an admin's move > the LMS department (when named) >
 * the department most of its teachers belong to (lecturers weigh most) > the
 * code prefix > Unassigned.
 */

export const UNASSIGNED = "Unassigned";
/** Department shown for a course placed in a school but in none of its departments. */
export const SCHOOL_WIDE = "School-wide";

export type PlacedBy = "override" | "lms" | "teachers" | "code";
export type Placement = { school: string; department: string; by: PlacedBy | null };

/** The university's schools and their departments, as the faculty site lists them. */
export const SCHOOLS: ReadonlyArray<{ name: string; departments: readonly string[] }> = [
  { name: "School of Engineering", departments: ["Physics", "Chemical Engineering & Materials Sciences", "Mechanical Engineering"] },
  { name: "School of Computing", departments: ["Software Engineering", "AI", "Computer Science"] },
  { name: "School of Humanities, Natural and Social Sciences", departments: ["Mathematics", "Economics", "English", "Education"] },
  { name: "School of Management", departments: ["Industrial Management"] },
  { name: "School of Agrotechnologies", departments: ["Agrotechnologies"] },
  { name: "School of Medicine", departments: ["Medicine"] },
  { name: "General Education", departments: ["General Education"] },
];

const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/^\s*(the\s+)?(department|dept\.?|school|faculty)\s+of\s+/, "")
    .replace(/\b(department|dept)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Other spellings of a department (LMS labels, the site's long names) → the canonical one. */
const DEPARTMENT_ALIASES: Record<string, string> = {
  "chemical engineering and materials sciences": "Chemical Engineering & Materials Sciences",
  "chemical engineering and materials science": "Chemical Engineering & Materials Sciences",
  "chemical and materials engineering": "Chemical Engineering & Materials Sciences",
  "chemical engineering": "Chemical Engineering & Materials Sciences",
  "materials science": "Chemical Engineering & Materials Sciences",
  "artificial intelligence": "AI",
  "ai": "AI",
  "computer science": "Computer Science",
  "software engineering": "Software Engineering",
  "mechanical engineering": "Mechanical Engineering",
  "physics": "Physics",
  "mathematics": "Mathematics",
  "math": "Mathematics",
  "economics": "Economics",
  "english": "English",
  "english language": "English",
  "education": "Education",
  "industrial management": "Industrial Management",
  "management": "Industrial Management",
  "agrotechnology": "Agrotechnologies",
  "agrotechnologies": "Agrotechnologies",
  "medicine": "Medicine",
  "general education": "General Education",
};

/** Other spellings of a school → the canonical one. */
const SCHOOL_ALIASES: Record<string, string> = Object.fromEntries([
  ...SCHOOLS.map((s) => [key(s.name), s.name]),
  ["engineering", "School of Engineering"],
  ["computing", "School of Computing"],
  ["humanities", "School of Humanities, Natural and Social Sciences"],
  ["humanities natural and social sciences", "School of Humanities, Natural and Social Sciences"],
  ["agrotechnologies", "School of Agrotechnologies"],
  ["agrotechnology", "School of Agrotechnologies"],
  ["medicine", "School of Medicine"],
  ["management", "School of Management"],
]);

const SCHOOL_OF = new Map(SCHOOLS.flatMap((s) => s.departments.map((d) => [d, s.name] as const)));

/** The canonical school name, or null. */
export const schoolOf = (name: string | null | undefined): string | null => (name?.trim() ? SCHOOL_ALIASES[key(name)] ?? null : null);

/** The canonical department name, or null. */
export const departmentOf = (name: string | null | undefined): string | null => (name?.trim() ? DEPARTMENT_ALIASES[key(name)] ?? null : null);

/** Department names that are not departments (the deans' listing and similar). */
const NOT_A_DEPARTMENT = /^deans?\b/i;

/**
 * A department label (and, when known, the school above it) on the university's
 * frame. A label we do not know stays as it is: under the school given, else as
 * its own school. Null when there is nothing to place by.
 */
export function unitOf(department: string | null | undefined, school?: string | null): Omit<Placement, "by"> | null {
  const d = department?.trim() && !NOT_A_DEPARTMENT.test(department.trim()) ? department.trim() : null;
  const s = school?.trim() || null;
  const dep = departmentOf(d);
  if (dep) return { school: SCHOOL_OF.get(dep)!, department: dep };
  const sc = schoolOf(s) ?? schoolOf(d);
  if (sc) {
    const only = SCHOOLS.find((x) => x.name === sc)!.departments;
    // A school-only label (or a department we do not know in a known school).
    if (d && !schoolOf(d)) return { school: sc, department: d.replace(/^department of\s+/i, "") };
    return { school: sc, department: only.length === 1 ? only[0] : SCHOOL_WIDE };
  }
  if (d) return { school: s ?? d.replace(/^department of\s+/i, ""), department: d.replace(/^department of\s+/i, "") };
  if (s) return { school: s, department: SCHOOL_WIDE };
  return null;
}

/**
 * Course-code prefixes (the letters before the number) → where the course sits.
 * Derived from the codes running on the LMS and checked against the courses
 * whose LMS department is named (CENG/CHEM → Chemical, CS/DSG → Computer
 * Science, AGR → Agrotechnologies, MD/MT/BIO → Medicine).
 */
export const CODE_PREFIXES: Record<string, Omit<Placement, "by">> = {
  CS: { school: "School of Computing", department: "Computer Science" },
  DSG: { school: "School of Computing", department: "Computer Science" },
  SE: { school: "School of Computing", department: "Software Engineering" },
  SEC: { school: "School of Computing", department: "Software Engineering" },
  AI: { school: "School of Computing", department: "AI" },
  DS: { school: "School of Computing", department: "AI" },
  MATH: { school: "School of Humanities, Natural and Social Sciences", department: "Mathematics" },
  STAT: { school: "School of Humanities, Natural and Social Sciences", department: "Mathematics" },
  ECON: { school: "School of Humanities, Natural and Social Sciences", department: "Economics" },
  ENG: { school: "School of Humanities, Natural and Social Sciences", department: "English" },
  ENGL: { school: "School of Humanities, Natural and Social Sciences", department: "English" },
  APLT: { school: "School of Humanities, Natural and Social Sciences", department: "English" },
  ED: { school: "School of Humanities, Natural and Social Sciences", department: "Education" },
  EDU: { school: "School of Humanities, Natural and Social Sciences", department: "Education" },
  HASS: { school: "School of Humanities, Natural and Social Sciences", department: SCHOOL_WIDE },
  ME: { school: "School of Engineering", department: "Mechanical Engineering" },
  MECH: { school: "School of Engineering", department: "Mechanical Engineering" },
  MENG: { school: "School of Engineering", department: "Mechanical Engineering" },
  ROB: { school: "School of Engineering", department: "Mechanical Engineering" },
  PHYS: { school: "School of Engineering", department: "Physics" },
  CENG: { school: "School of Engineering", department: "Chemical Engineering & Materials Sciences" },
  CHEM: { school: "School of Engineering", department: "Chemical Engineering & Materials Sciences" },
  MSE: { school: "School of Engineering", department: "Chemical Engineering & Materials Sciences" },
  EENG: { school: "School of Engineering", department: SCHOOL_WIDE },
  MGMT: { school: "School of Management", department: "Industrial Management" },
  MGT: { school: "School of Management", department: "Industrial Management" },
  GMGT: { school: "School of Management", department: "Industrial Management" },
  IMGT: { school: "School of Management", department: "Industrial Management" },
  IM: { school: "School of Management", department: "Industrial Management" },
  FINA: { school: "School of Management", department: "Industrial Management" },
  AGR: { school: "School of Agrotechnologies", department: "Agrotechnologies" },
  MD: { school: "School of Medicine", department: "Medicine" },
  MED: { school: "School of Medicine", department: "Medicine" },
  MT: { school: "School of Medicine", department: "Medicine" },
  BIO: { school: "School of Medicine", department: "Medicine" },
};

/** "ECON231X" → "ECON". */
export const codePrefix = (code: string) => code.trim().toUpperCase().match(/^[A-Z]+/)?.[0] ?? "";

export const placeByCode = (code: string): Omit<Placement, "by"> | null => CODE_PREFIXES[codePrefix(code)] ?? null;

/** How much a teacher's role counts towards a course's department: lecturers most. */
export const roleWeight = (role: string | null | undefined) => (/lect/i.test(role ?? "") ? 3 : 1);

export type TeacherVote = { department: string | null; school: string | null; role: string | null };

/**
 * The department most of the course's teachers belong to, lecturers weighted
 * highest. Ties go to the department of a lecturer, then by name. Null when no
 * teacher has a known department.
 */
export function placeByTeachers(votes: TeacherVote[]): Omit<Placement, "by"> | null {
  const score = new Map<string, { unit: Omit<Placement, "by">; w: number; lecture: number }>();
  for (const v of votes) {
    const unit = unitOf(v.department, v.school);
    if (!unit) continue;
    const k = `${unit.school}|${unit.department}`;
    const s = score.get(k) ?? { unit, w: 0, lecture: 0 };
    s.w += roleWeight(v.role);
    if (roleWeight(v.role) > 1) s.lecture++;
    score.set(k, s);
  }
  const best = [...score.values()].sort((a, b) => b.w - a.w || b.lecture - a.lecture || a.unit.department.localeCompare(b.unit.department))[0];
  return best?.unit ?? null;
}

export type PlaceInput = {
  code: string;
  /** An admin's move. */
  override?: { school: string; department: string | null } | null;
  /** The LMS department chain, top first (named levels only). */
  lms?: string[];
  teachers?: TeacherVote[];
};

/** Where a course sits and why (see the precedence at the top). */
export function place(input: PlaceInput): Placement {
  if (input.override) {
    const school = input.override.school;
    return { school, department: input.override.department || SCHOOL_WIDE, by: "override" };
  }
  const chain = input.lms ?? [];
  if (chain.length) {
    const unit = unitOf(chain[chain.length - 1], chain.length > 1 ? chain[0] : null);
    if (unit) return { ...unit, by: "lms" };
  }
  const t = placeByTeachers(input.teachers ?? []);
  if (t) return { ...t, by: "teachers" };
  const c = placeByCode(input.code);
  if (c) return { ...c, by: "code" };
  return { school: UNASSIGNED, department: UNASSIGNED, by: null };
}

/** The places an admin can move a course to: every school's departments, and the school as a whole. */
export const MOVE_TARGETS: Array<{ school: string; department: string | null; label: string }> = SCHOOLS.flatMap((s) => [
  ...s.departments.map((d) => ({ school: s.name, department: d, label: s.departments.length === 1 && d === s.name ? d : `${s.name} · ${d}` })),
  ...(s.departments.length > 1 ? [{ school: s.name, department: null, label: `${s.name} · ${SCHOOL_WIDE}` }] : []),
]);

/** Whether an admin's move names a real place. */
export const isMoveTarget = (school: string, department: string | null) => MOVE_TARGETS.some((t) => t.school === school && t.department === department);

export const PLACED_BY_LABEL: Record<PlacedBy, string> = { override: "moved", lms: "LMS", teachers: "teachers", code: "code" };
