import { eq, inArray } from "drizzle-orm";
import { roleOf } from "@/core/people";
import type { TeacherRole, TeacherSummary } from "@/core/ratings";
import { db } from "@/lib/db";
import { lmsCourseTeachers, lmsCourses, lmsDepartments, lmsSemesters, lmsTeachers, type LmsTeacherEducation, type LmsTeacherPublication } from "@/lib/db/schema";
import { termName } from "@/server/sync/types";
import { publicCache, TAGS } from "./cache";
import { DAY_ABBR, lessonSlots, mentionsOf, ROLE_LABEL, teacherSummaries, teachersByIds, type MentionsView } from "./shared";
import type { Viewer } from "./courses";
import { loadStudent } from "./student";

/** Professor (Figma 7.4, 7.5, 7.9) and All professors (7.7). */

export type ProfessorView = {
  id: string;
  name: string;
  /** "Senior lecturer", from the LMS staff profile. */
  position: string | null;
  /** Drawn face URL, null when none is assigned. Always set by the server. */
  face?: string | null;
  department: string | null;
  school: string | null;
  summary: TeacherSummary;
  courses: Array<{ code: string; name: string; role: TeacherRole; roleLabel: string; pressFPct: number | null; href: string }>;
  when: Array<{ day: string; weekday: number; time: string; course: string; code: string; room: string | null }>;
  /** Degrees from the LMS staff profile; null when the LMS has none. */
  education: LmsTeacherEducation[] | null;
  /** Publications from the LMS staff profile; null when the LMS has none. */
  publications: LmsTeacherPublication[] | null;
  /** Research area from the LMS staff profile. Always set by the server. */
  research?: string | null;
  /** Whole years at NewUU (at least 1), counted from the first semester they taught. */
  years: number | null;
  /** That first semester, "Fall 2023". Always set by the server. */
  since?: string | null;
  anonymous: MentionsView;
  signedIn: boolean;
  /** The viewer is taught by this teacher now. */
  teachesYou: boolean;
};

type Dept = { id: string; parentId: string | null; name: string | null };

const rootOf = (id: string | null, all: Map<string, Dept>) => {
  let d = id ? all.get(id) : undefined;
  const seen = new Set<string>();
  while (d?.parentId && all.has(d.parentId) && !seen.has(d.id)) {
    seen.add(d.id);
    d = all.get(d.parentId);
  }
  return d ?? null;
};

/** Start day of a semester: its stored study start, else from its name ("Fall 2023" → 2023-09-01). */
function semesterStart(s: { name: string | null; starts: string | null }): string | null {
  if (s.starts) return s.starts;
  const term = termName(s.name);
  const m = term.match(/^(Fall|Spring|Summer) (\d{4})$/);
  return m ? `${m[2]}-${m[1] === "Fall" ? "09" : m[1] === "Spring" ? "02" : "06"}-01` : null;
}

/** Whole years since `startDay`, at least 1. */
export const yearsSince = (startDay: string, now: Date) => Math.max(1, Math.floor((now.getTime() - Date.parse(`${startDay}T00:00:00+05:00`)) / (365.25 * 86_400_000)));

type ProfessorPublic = Omit<ProfessorView, "signedIn" | "teachesYou" | "years"> & { sinceDay: string | null };

const professorPublic = publicCache(
  "professor-public",
  async (id: string): Promise<ProfessorPublic | null> => {
    const [people, [profile]] = await Promise.all([
      teachersByIds([id]),
      db().select({ department: lmsTeachers.department, education: lmsTeachers.education, publications: lmsTeachers.publications, research: lmsTeachers.scienceDirection }).from(lmsTeachers).where(eq(lmsTeachers.id, id)),
    ]);
    const person = people.get(id);
    if (!person) return null;
    const links = await db().select().from(lmsCourseTeachers).where(eq(lmsCourseTeachers.teacherId, id));
    const ids = [...new Set(links.map((l) => l.courseId))];
    const [rows, summaries, depts, anonymous] = await Promise.all([
      ids.length ? db().select().from(lmsCourses).where(inArray(lmsCourses.id, ids)) : Promise.resolve([]),
      teacherSummaries([id]),
      db().select({ id: lmsDepartments.id, parentId: lmsDepartments.parentId, name: lmsDepartments.name }).from(lmsDepartments),
      mentionsOf("teacher", id),
    ]);
    const summary = summaries[id] ?? { enough: false, count: 0 };
    const deptMap = new Map(depts.map((d) => [d.id, d]));
    const newest = [...rows].sort((a, b) => Number(b.semesterId ?? 0) - Number(a.semesterId ?? 0));
    const dept = newest.find((r) => r.departmentId && deptMap.has(r.departmentId));
    // The LMS staff profile names the department; the courses' department is the fallback.
    const department = profile?.department ?? (dept ? deptMap.get(dept.departmentId!)?.name ?? null : null);

    // Years at NewUU: from the earliest semester they taught in that we can date.
    const semesterIds = [...new Set(rows.map((r) => r.semesterId).filter((s): s is string => !!s))];
    const sems = semesterIds.length ? await db().select().from(lmsSemesters).where(inArray(lmsSemesters.id, semesterIds)) : [];
    const first = sems.map((s) => ({ name: s.name, day: semesterStart(s) })).filter((s) => s.day).sort((a, b) => a.day!.localeCompare(b.day!))[0];
    const school = dept ? rootOf(dept.departmentId, deptMap)?.name ?? null : null;

    const courses = new Map<string, ProfessorView["courses"][number]>();
    for (const r of newest) {
      for (const l of links.filter((x) => x.courseId === r.id)) {
        const role = roleOf(l.role);
        const key = `${r.code}|${role}`;
        if (courses.has(key)) continue;
        const pct = summary.enough ? summary.byCourse.find((b) => b.courseId === r.code && b.role === role)?.pct ?? null : null;
        courses.set(key, { code: r.code, name: r.name, role, roleLabel: ROLE_LABEL[role].toLowerCase(), pressFPct: pct, href: `/c/${r.code}` });
      }
    }
    // Weekly slots from the newest semester each course ran.
    const latestByCode = new Map<string, (typeof rows)[number]>();
    for (const r of newest) if (!latestByCode.has(r.code)) latestByCode.set(r.code, r);
    const when = new Map<string, ProfessorView["when"][number]>();
    for (const r of latestByCode.values()) {
      for (const s of lessonSlots(r.raw).filter((x) => x.teacherId === id)) {
        const key = `${s.weekday}|${s.time}|${r.code}`;
        if (!when.has(key)) when.set(key, { day: DAY_ABBR[s.weekday], weekday: s.weekday, time: s.time, course: r.name, code: r.code, room: s.room });
      }
    }
    return {
      id, name: person.name, position: person.position, face: person.face, department, school, summary,
      courses: [...courses.values()],
      when: [...when.values()].sort((a, b) => (a.weekday + 6) % 7 - (b.weekday + 6) % 7 || a.time.localeCompare(b.time)),
      education: profile?.education?.length ? profile.education : null,
      publications: profile?.publications?.length ? profile.publications : null,
      research: profile?.research ?? null,
      since: first ? (first.name ? termName(first.name) || first.name : null) : null,
      sinceDay: first?.day ?? null,
      anonymous,
    };
  },
  (id) => [TAGS.teacher(id), TAGS.ratings, TAGS.catalog],
);

export async function professor(id: string, viewer: Viewer, now = new Date()): Promise<ProfessorView | null> {
  const [pub, student] = await Promise.all([professorPublic(id), viewer ? loadStudent(viewer.userId, { refresh: false }) : Promise.resolve(null)]);
  if (!pub) return null;
  const { sinceDay, ...rest } = pub;
  return { ...rest, years: sinceDay ? yearsSince(sinceDay, now) : null, signedIn: !!student, teachesYou: !!student?.cache?.timetable.some((l) => l.teacher === id) };
}

export type ProfessorsView = {
  count: number;
  schools: string[];
  yours: Array<ProfessorRow>;
  all: Array<ProfessorRow>;
};
export type ProfessorRow = {
  id: string; name: string; department: string | null; school: string | null; course: string | null; pressFPct: number | null; href: string;
  /** Drawn face URL, null when none is assigned. Always set by the server. */
  face?: string | null;
};

const professorsPublic = publicCache(
  "professors",
  async (): Promise<Omit<ProfessorsView, "yours">> => {
    const [links, courses, depts] = await Promise.all([
      db().select().from(lmsCourseTeachers),
      db().select({ id: lmsCourses.id, code: lmsCourses.code, name: lmsCourses.name, departmentId: lmsCourses.departmentId, semesterId: lmsCourses.semesterId }).from(lmsCourses),
      db().select({ id: lmsDepartments.id, parentId: lmsDepartments.parentId, name: lmsDepartments.name }).from(lmsDepartments),
    ]);
    const ids = [...new Set(links.map((l) => l.teacherId))];
    const [people, summaries] = await Promise.all([teachersByIds(ids), teacherSummaries(ids)]);
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const deptMap = new Map(depts.map((d) => [d.id, d]));
    const all: ProfessorRow[] = ids.map((id) => {
      const taught = links.filter((l) => l.teacherId === id).map((l) => courseById.get(l.courseId)).filter((c): c is NonNullable<typeof c> => !!c)
        .sort((a, b) => Number(b.semesterId ?? 0) - Number(a.semesterId ?? 0));
      const deptId = taught.find((c) => c.departmentId)?.departmentId ?? null;
      const s = summaries[id];
      return {
        id, name: people.get(id)?.name ?? "Teacher", department: people.get(id)?.department ?? (deptId ? deptMap.get(deptId)?.name ?? null : null), school: rootOf(deptId, deptMap)?.name ?? null,
        course: taught[0]?.name ?? null, pressFPct: s?.enough ? s.pressFPct : null, href: `/p/${id}`, face: people.get(id)?.face ?? null,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { count: all.length, schools: [...new Set(all.map((p) => p.school).filter((s): s is string => !!s))].sort(), all };
  },
  () => [TAGS.catalog, TAGS.ratings],
);

/** Figma 7.7: everyone teaching, the viewer's own teachers first. */
export async function professors(viewer: Viewer): Promise<ProfessorsView> {
  const [pub, student] = await Promise.all([professorsPublic(), viewer ? loadStudent(viewer.userId, { refresh: false }) : Promise.resolve(null)]);
  const mine = new Set((student?.cache?.timetable ?? []).map((l) => l.teacher).filter(Boolean));
  return { ...pub, yours: pub.all.filter((p) => mine.has(p.id)) };
}
