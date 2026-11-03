import { eq, inArray } from "drizzle-orm";
import { roleOf } from "@/core/people";
import type { TeacherRole, TeacherSummary } from "@/core/ratings";
import { ratingWindow, termOfDate } from "@/core/semester";
import { db } from "@/lib/db";
import { lmsCourseTeachers, lmsCourses, lmsDepartments, lmsSemesters, lmsTeachers, type LmsTeacherEducation, type LmsTeacherPublication } from "@/lib/db/schema";
import { termName } from "@/server/sync/types";
import { publicCache, TAGS } from "./cache";
import { DECISION_TAGS } from "@/server/decisions";
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
  /** Every course they have taught; `now`: taught this semester. `now` is always set by the server. */
  courses: Array<{ code: string; name: string; role: TeacherRole; roleLabel: string; pressFPct: number | null; href: string; now?: boolean }>;
  /** This semester's weekly classes; `role`: the class's lesson type. `role` is always set by the server. */
  when: Array<{ day: string; weekday: number; time: string; course: string; code: string; room: string | null; role?: TeacherRole }>;
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
  /**
   * Where "Press F" goes: the rating of the viewer's own course with this
   * teacher (`/rate/<courseId>`, newest first), else the rating queue. Always set by the server.
   */
  rateHref?: string;
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

/** A weekly class with the term it runs in ("Fall 2026"). */
type ProfessorWhen = ProfessorView["when"][number] & { term: string };

type ProfessorPublic = Omit<ProfessorView, "signedIn" | "teachesYou" | "years" | "rateHref" | "courses" | "when"> & {
  courses: Array<ProfessorView["courses"][number] & { terms: string[] }>;
  when: ProfessorWhen[];
  sinceDay: string | null;
  courseIds: string[];
};

const professorPublic = publicCache(
  "professor-public-v2",
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

    // The term each course row ran in: its semester's name, else the dates of its classes.
    const semTerm = new Map(sems.map((s) => [s.id, s.name ? termName(s.name) : ""]));
    const slotsOf = new Map(rows.map((r) => [r.id, lessonSlots(r.raw)]));
    const termsOf = (r: (typeof rows)[number]) => {
      const named = r.semesterId ? semTerm.get(r.semesterId) : "";
      if (named && /^(Fall|Spring|Summer) \d{4}$/.test(named)) return [named];
      return [...new Set((slotsOf.get(r.id) ?? []).map((s) => termOfDate(new Date(s.at))).filter((t): t is string => !!t))];
    };

    const courses = new Map<string, ProfessorView["courses"][number] & { terms: string[] }>();
    for (const r of newest) {
      for (const l of links.filter((x) => x.courseId === r.id)) {
        const role = roleOf(l.role);
        const key = `${r.code}|${role}`;
        const seen = courses.get(key);
        if (seen) {
          seen.terms = [...new Set([...seen.terms, ...termsOf(r)])];
          continue;
        }
        const pct = summary.enough ? summary.byCourse.find((b) => b.courseId === r.code && b.role === role)?.pct ?? null : null;
        courses.set(key, { code: r.code, name: r.name, role, roleLabel: ROLE_LABEL[role].toLowerCase(), pressFPct: pct, href: `/c/${r.code}`, terms: termsOf(r) });
      }
    }
    // Weekly slots of every semester, each tagged with its term; `professor()` keeps the current one.
    const when = new Map<string, ProfessorWhen>();
    for (const r of newest) {
      for (const s of (slotsOf.get(r.id) ?? []).filter((x) => x.teacherId === id)) {
        const term = termOfDate(new Date(s.at)) ?? "";
        const key = `${term}|${s.weekday}|${s.time}|${r.code}`;
        if (!when.has(key)) when.set(key, { day: DAY_ABBR[s.weekday], weekday: s.weekday, time: s.time, course: r.name, code: r.code, room: s.room, role: s.role, term });
      }
    }
    return {
      id, name: person.name, position: person.position, face: person.face, department,
      // "Computer Science · Computer Science": a department named like its school shows once.
      school: school && department && school.trim().toLowerCase() === department.trim().toLowerCase() ? null : school,
      summary,
      courses: [...courses.values()],
      when: [...when.values()].sort((a, b) => (a.weekday + 6) % 7 - (b.weekday + 6) % 7 || a.time.localeCompare(b.time)),
      education: profile?.education?.length ? profile.education : null,
      publications: profile?.publications?.length ? profile.publications : null,
      research: profile?.research ?? null,
      since: first ? (first.name ? termName(first.name) || first.name : null) : null,
      sinceDay: first?.day ?? null,
      courseIds: ids,
      anonymous,
    };
  },
  (id) => [TAGS.teacher(id), TAGS.ratings, TAGS.catalog, DECISION_TAGS.moderation],
);

export async function professor(id: string, viewer: Viewer, now = new Date()): Promise<ProfessorView | null> {
  const [pub, student] = await Promise.all([professorPublic(id), viewer ? loadStudent(viewer.userId, { refresh: false }) : Promise.resolve(null)]);
  if (!pub) return null;
  const { sinceDay, courseIds, courses, when, ...rest } = pub;
  // Public data is cached across semesters, so "this semester" is decided per request.
  const term = termOfDate(now);
  return {
    ...rest,
    courses: courses.map(({ terms, ...c }) => ({ ...c, now: !!term && (terms ?? []).includes(term) })),
    when: when.filter((w) => w.term === term).map(({ term: _term, ...w }) => w),
    years: sinceDay ? yearsSince(sinceDay, now) : null,
    signedIn: !!student,
    teachesYou: !!student?.cache?.timetable.some((l) => l.teacher === id),
    rateHref: student ? rateHrefFor(student.sync.courses, courseIds, ratingWindow(now).open ? new Set() : new Set(student.sync.semesters.filter((s) => s.open).map((s) => s.id))) : "/rate",
  };
}

/**
 * The viewer's newest course taught by this teacher that can be rated, as its
 * rating link (`closed`: semesters whose rating window has not opened); the rating queue when there is none.
 */
export function rateHrefFor(taken: Array<{ subjectId: string; semesterId: string }>, teacherCourseIds: string[], closed: Set<string> = new Set()): string {
  const ids = new Set(teacherCourseIds);
  const hit = taken.filter((c) => ids.has(c.subjectId) && !closed.has(c.semesterId)).sort((a, b) => Number(b.semesterId) - Number(a.semesterId))[0];
  return hit ? `/rate/${encodeURIComponent(hit.subjectId)}` : "/rate";
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
