import { currentUser, gradebookData, gradebookSemesters, transcript } from "@/lib/lms/client";
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
};

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
  };
}
