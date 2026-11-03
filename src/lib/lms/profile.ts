import { currentUser, gradebookData, gradebookSemesters, transcript } from "@/lib/lms/client";
import { listOf, pick } from "@/lib/lms/semesters";
import { sessionFor } from "@/lib/lms/store";

/**
 * The signed-in student's own LMS profile: identity plus academic record
 * (GPA, ECTS, grades per semester). Read live from the LMS with the student's
 * saved session — private to that student, never harvested or shown to others.
 */

export type ProfileCourse = { name: string; mark: number | null; passed: boolean };
export type ProfileSemester = { name: string; year: number | null; open: boolean; courses: ProfileCourse[] };
export type LmsProfile = {
  name: string;
  email: string;
  gpa: number | null;
  ectsEarned: number | null;
  ectsTotal: number | null;
  honors: boolean;
  semesters: ProfileSemester[];
  /**
   * GPA per semester, keyed by the LMS semester id and by its name, when the
   * transcript lists semesters with a GPA. The NewUU transcript header we have
   * seen carries only the overall GPA, so this is usually empty.
   */
  semesterGpa?: Record<string, number>;
};

/** Per-semester GPAs from a transcript payload, if it lists any (`semesters[].gpa`). */
export function semesterGpas(payload: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const inner = root.transcript && typeof root.transcript === "object" ? (root.transcript as Record<string, unknown>) : {};
  for (const r of [...listOf(root, ["semesters", "semester_list", "semesterList"]), ...listOf(inner, ["semesters", "semester_list", "semesterList"])]) {
    const gpa = Number(pick(r, ["gpa", "semester_gpa", "gpa_semester"]));
    if (!Number.isFinite(gpa) || gpa <= 0) continue;
    const id = pick(r, ["semester_id", "id"]);
    const name = pick(r, ["semester_name", "name"]);
    if (id) out[id] = gpa;
    if (name) out[name] = gpa;
  }
  return out;
}

const num = (v?: string | null) => {
  const n = Number(v);
  return v == null || v === "" || Number.isNaN(n) ? null : n;
};

export async function lmsProfile(userId: string, email: string): Promise<LmsProfile | null> {
  const session = await sessionFor(userId);
  if (!session) return null;

  const [me, tr, semesters] = await Promise.all([
    currentUser(session).catch(() => null),
    transcript(session).catch(() => null),
    gradebookSemesters(session).catch(() => [] as Awaited<ReturnType<typeof gradebookSemesters>>),
  ]);
  const head = tr?.transcript ?? tr ?? {};

  // Newest semester first; the gradebook lists them oldest-first.
  const ordered = [...(semesters ?? [])].sort((a, b) => (b.semester_id ?? 0) - (a.semester_id ?? 0));
  const grades = await Promise.all(
    ordered.map((s) => gradebookData(session, s.semester_id).catch(() => null))
  );

  const built: ProfileSemester[] = ordered.map((s, i) => {
    const subjects = grades[i]?.resultSubjects ?? {};
    const courses: ProfileCourse[] = Object.values(subjects).map((row) => ({
      name: row.subject?.name?.trim() || "Course",
      mark: row.final_grade?.mark ?? null,
      passed: row.final_grade?.positive_status ?? false,
    }));
    return {
      name: s.semester_name?.trim() || `Semester ${s.semester_id}`,
      year: s.year_of_study ?? null,
      open: s.is_open === 1,
      courses: courses.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }).filter((s) => s.courses.length > 0);

  const given = me?.username?.trim();
  const family = me?.sur_name?.trim() || me?.last_name?.trim();
  const name = [given, family].filter(Boolean).join(" ") || email;

  return {
    name,
    email,
    gpa: num(head.gpa),
    ectsEarned: num(head.ects),
    ectsTotal: num(head.ects_all),
    honors: head.diploma_with_honor === "1",
    semesters: built,
    semesterGpa: semesterGpas(tr),
  };
}
