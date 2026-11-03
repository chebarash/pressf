import { eq, inArray } from "drizzle-orm";
import { roleOf } from "@/core/people";
import { WEEKS } from "@/core/semester";
import { localDay, shortDate } from "@/core/time";
import { courseDetails, resolveRequirement } from "@/lib/content";
import { getCatalog } from "@/lib/catalog";
import { db } from "@/lib/db";
import { lmsCourseTeachers, lmsCourses, lmsCurricula, lmsDepartments, lmsPrograms, type LmsCurriculumData } from "@/lib/db/schema";
import { publicCache, TAGS } from "./cache";
import type { Viewer } from "./courses";
import { lessonSlots, ratingsByCode, recommendOf, semesterPhases, slotsLabel, teacherSummaries, teachersByIds, type RatingSummaryView, type SemesterPhaseView } from "./shared";
import { loadStudent, type Student } from "./student";

/** Curriculum (7.6), Schools and programs (7.8), Next semester and cohorts (4.14, 4.15). */

type Plan = { id: string; programId: string | null; data: LmsCurriculumData };

const plans = publicCache(
  "curricula",
  async (): Promise<Plan[]> => (await db().select().from(lmsCurricula)).map((r) => ({ id: r.workEducationPlanId, programId: r.programId, data: r.data })),
  () => [TAGS.catalog],
);

const size = (p: Plan) => p.data.semesters.reduce((n, s) => n + s.courses.length, 0);

/** The cohort plan that fits the student best: most of their own LMS courses in it. */
function planFor(all: Plan[], student: Student | null, programId?: string | null): Plan | null {
  const mine = new Set([...(student?.sync.courses.map((c) => c.subjectId) ?? []), ...(student?.cache?.enrollment?.codes ?? [])]);
  const candidates = programId ? all.filter((p) => p.programId === programId) : all;
  if (!candidates.length) return null;
  const score = (p: Plan) => p.data.semesters.reduce((n, s) => n + s.courses.filter((c) => mine.has(c.id) || (c.code && mine.has(c.code))).length, 0);
  const best = [...candidates].sort((a, b) => score(b) - score(a) || size(b) - size(a))[0];
  return programId || score(best) > 0 ? best : null;
}

export type CurriculumCourseView = {
  courseId: string;
  code: string | null;
  name: string;
  ects: number | null;
  recommendPct: number | null;
  status: "passed" | "failed" | "now" | "planned" | null;
  href: string | null;
};

export type CurriculumView = {
  program: { id: string; name: string } | null;
  years: Array<{ year: number; terms: Array<{ label: string; semesterId: string; courses: CurriculumCourseView[] }> }>;
  programs: Array<{ id: string; name: string }>;
};

function statusOf(student: Student | null, courseId: string, code: string | null): CurriculumCourseView["status"] {
  if (!student) return null;
  const open = new Set(student.sync.semesters.filter((s) => s.open).map((s) => s.id));
  const hit = student.sync.courses.find((c) => c.subjectId === courseId);
  if (hit) return open.has(hit.semesterId) ? "now" : hit.passed === false || hit.fx ? "failed" : "passed";
  if (code && student.cache?.enrollment?.codes.includes(code)) return "now";
  return "planned";
}

export async function curriculum(viewer: Viewer, programId?: string | null): Promise<CurriculumView> {
  const [all, programs, student] = await Promise.all([plans(), db().select({ id: lmsPrograms.id, name: lmsPrograms.name }).from(lmsPrograms), viewer ? loadStudent(viewer.userId, { refresh: false }) : Promise.resolve(null)]);
  const plan = planFor(all, student, programId);
  const withPlans = new Set(all.map((p) => p.programId));
  const programList = programs.filter((p) => withPlans.has(p.id)).map((p) => ({ id: p.id, name: p.name ?? "Program" })).sort((a, b) => a.name.localeCompare(b.name));
  if (!plan) return { program: null, years: [], programs: programList };
  const codes = plan.data.semesters.flatMap((s) => s.courses.map((c) => c.code ?? "")).filter(Boolean);
  const ratings = await ratingsByCode([...new Set(codes)]);
  const years = new Map<number, CurriculumView["years"][number]>();
  plan.data.semesters.forEach((s, i) => {
    const year = s.year ?? Math.ceil((i + 1) / 2);
    const entry = years.get(year) ?? { year, terms: [] };
    entry.terms.push({
      label: entry.terms.length === 0 ? "Fall" : entry.terms.length === 1 ? "Spring" : "Summer",
      semesterId: s.semesterId,
      courses: s.courses.map((c) => ({
        courseId: c.id, code: c.code, name: c.name, ects: c.ects, recommendPct: c.code ? recommendOf(ratings[c.code]) : null,
        status: statusOf(student, c.id, c.code), href: c.code ? `/c/${c.code}` : null,
      })),
    });
    years.set(year, entry);
  });
  const name = programs.find((p) => p.id === plan.programId)?.name ?? "Program";
  return { program: plan.programId ? { id: plan.programId, name } : null, years: [...years.values()].sort((a, b) => a.year - b.year), programs: programList };
}

export type SchoolsView = { schools: Array<{ id: string; name: string; programs: Array<{ id: string; name: string }> }>; programCount: number };

/** Figma 7.8: schools (top departments) and their programs, from the LMS. */
export const schools = publicCache(
  "schools",
  async (): Promise<SchoolsView> => {
    const [depts, programs] = await Promise.all([
      db().select({ id: lmsDepartments.id, parentId: lmsDepartments.parentId, name: lmsDepartments.name }).from(lmsDepartments),
      db().select({ id: lmsPrograms.id, name: lmsPrograms.name, departmentId: lmsPrograms.departmentId }).from(lmsPrograms),
    ]);
    const byId = new Map(depts.map((d) => [d.id, d]));
    const root = (id: string | null) => {
      let d = id ? byId.get(id) : undefined;
      const seen = new Set<string>();
      while (d?.parentId && byId.has(d.parentId) && !seen.has(d.id)) { seen.add(d.id); d = byId.get(d.parentId); }
      return d ?? null;
    };
    const out = new Map<string, SchoolsView["schools"][number]>();
    for (const p of programs) {
      const r = root(p.departmentId);
      const key = r?.id ?? "other";
      const s = out.get(key) ?? { id: key, name: r?.name ?? "Other programs", programs: [] };
      s.programs.push({ id: p.id, name: p.name ?? "Program" });
      out.set(key, s);
    }
    const list = [...out.values()].map((s) => ({ ...s, programs: s.programs.sort((a, b) => a.name.localeCompare(b.name)) })).sort((a, b) => a.name.localeCompare(b.name));
    return { schools: list, programCount: programs.length };
  },
  () => [TAGS.catalog],
);

/** `face`: the drawn face URL, null when none is assigned. Always set by the server. */
export type Cohort = { teacherId: string; name: string; when: string | null; room: string | null; pressFPct: number | null; face?: string | null };

export type NextCourse = {
  courseId: string;
  code: string | null;
  name: string;
  ects: number | null;
  ratings: RatingSummaryView | null;
  recommendPct: number | null;
  cohorts: Cohort[];
  prerequisites: Array<{ text: string; code: string | null; status: "passed" | "in-progress" | "missing" | null }>;
  href: string | null;
};

export type NextSemesterView = {
  term: string | null;
  ects: number;
  courses: NextCourse[];
  /**
   * Registration milestones ahead: the LMS semester calendar (cohort selection,
   * schedule builder, add/drop, classes start) when synced, else the published academic calendar.
   */
  phases: Array<{ title: string; starts: string; ends: string; label: string; kind?: SemesterPhaseView["kind"] | "registration" | "induction"; semester?: string | null }>;
  /** No study plan found for the student yet. */
  missing: boolean;
};

/** The plan semester after the one the student is taking now. */
function planNext(plan: Plan, student: Student) {
  const current = new Set([...student.sync.courses.filter((c) => student.sync.semesters.find((s) => s.id === c.semesterId)?.open).map((c) => c.subjectId), ...(student.cache?.enrollment?.codes ?? [])]);
  const index = plan.data.semesters.reduce((best, s, i) => (s.courses.filter((c) => current.has(c.id) || (c.code && current.has(c.code))).length > 0 ? i : best), -1);
  return { next: plan.data.semesters[index + 1] ?? null, index };
}

/** "9–13 Feb", or "28 Jan – 3 Feb" across months. */
const dayRange = (a: string, b: string) =>
  a === b ? shortDate(a) : a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8, 10))}–${shortDate(b)}` : `${shortDate(a)} – ${shortDate(b)}`;

export type NextSemesterEntry = { term: string | null; courses: number | null; selection: string | null };

/** The "Next: Spring 2027 · 5 courses · cohort selection 9–13 Feb" strip on My courses (Figma 4.1). */
export async function nextSemesterEntry(student: Student, now = new Date()): Promise<NextSemesterEntry> {
  const [all, phases] = await Promise.all([plans(), semesterPhases(localDay(now))]);
  const plan = planFor(all, student);
  const next = plan ? planNext(plan, student).next : null;
  const selection = phases.find((p) => p.kind === "cohort-selection") ?? null;
  return { term: selection?.semester ?? null, courses: next ? next.courses.length : null, selection: selection ? dayRange(selection.startDay, selection.endDay) : null };
}

/** Figma 4.14 and 4.15: the next semester from the student's cohort plan, with cohorts per course. */
export async function nextSemester(userId: string, now = new Date()): Promise<NextSemesterView | null> {
  const today = localDay(now);
  const [student, all, lmsPhases] = await Promise.all([loadStudent(userId), plans(), semesterPhases(today)]);
  if (!student) return null;
  const plan = planFor(all, student);
  const label = (a: string, b: string) => (a === b ? shortDate(a) : `${shortDate(a)} – ${shortDate(b)}`);
  const fromLms = lmsPhases
    .filter((p) => p.kind !== "other" && !(p.kind === "studies" && p.startDay < today))
    .slice(0, 4)
    // Classes start is a day, not a range.
    .map((p) => (p.kind === "studies" ? { ...p, endDay: p.startDay } : p))
    .map((p) => ({ title: p.title, starts: p.startDay, ends: p.endDay, label: label(p.startDay, p.endDay), kind: p.kind, semester: p.semester }));
  const phases: NextSemesterView["phases"] = fromLms.length
    ? fromLms
    : WEEKS.filter((w) => (w.kind === "registration" || w.kind === "induction") && w.ends >= today)
        .slice(0, 3)
        .map((w) => ({ title: w.kind === "registration" ? "Course registration in LMS" : "Classes start", starts: w.starts, ends: w.ends, label: label(w.starts, w.ends), kind: w.kind === "registration" ? "registration" as const : "induction" as const, semester: null }));
  if (!plan) return { term: null, ects: 0, courses: [], phases, missing: true };

  const { next, index } = planNext(plan, student);
  if (!next) return { term: null, ects: 0, courses: [], phases, missing: index < 0 };

  const codes = next.courses.map((c) => c.code ?? "").filter(Boolean);
  const [ratings, latest, details, catalog] = await Promise.all([
    ratingsByCode(codes),
    codes.length ? db().select({ id: lmsCourses.id, code: lmsCourses.code, semesterId: lmsCourses.semesterId, raw: lmsCourses.raw }).from(lmsCourses).where(inArray(lmsCourses.code, codes)) : Promise.resolve([]),
    Promise.all(codes.map((c) => courseDetails(c))),
    getCatalog(),
  ]);
  const newest = new Map<string, (typeof latest)[number]>();
  for (const r of latest.sort((a, b) => Number(b.semesterId ?? 0) - Number(a.semesterId ?? 0))) if (!newest.has(r.code)) newest.set(r.code, r);
  const ids = [...newest.values()].map((r) => r.id);
  const links = ids.length ? await db().select().from(lmsCourseTeachers).where(inArray(lmsCourseTeachers.courseId, ids)) : [];
  const leads = links.filter((l) => roleOf(l.role) === "lecture");
  const [people, summaries] = await Promise.all([teachersByIds(leads.map((l) => l.teacherId)), teacherSummaries([...new Set(leads.map((l) => l.teacherId))])]);

  const passedIds = new Set(student.sync.courses.filter((c) => c.passed).map((c) => c.subjectId));
  const passedCodes = new Set((await (passedIds.size ? db().select({ code: lmsCourses.code }).from(lmsCourses).where(inArray(lmsCourses.id, [...passedIds])) : Promise.resolve([]))).map((r) => r.code));
  const nowCodes = new Set(student.cache?.enrollment?.codes ?? []);

  const courses: NextCourse[] = next.courses.map((c) => {
    const row = c.code ? newest.get(c.code) : undefined;
    const slots = row ? lessonSlots(row.raw) : [];
    const cohorts: Cohort[] = row
      ? [...new Set(leads.filter((l) => l.courseId === row.id).map((l) => l.teacherId))].map((tid) => {
          const mine = slots.filter((s) => s.teacherId === tid);
          const s = summaries[tid];
          return { teacherId: tid, name: people.get(tid)?.name ?? "Teacher", when: slotsLabel(mine), room: mine.find((x) => x.room)?.room ?? null, pressFPct: s?.enough ? s.pressFPct : null, face: people.get(tid)?.face ?? null };
        })
      : [];
    const d = c.code ? details[codes.indexOf(c.code)] : null;
    const prerequisites = (d?.data.prerequisites.groups.flatMap((g) => g.any_of) ?? []).map((i) => {
      const r = resolveRequirement(i, catalog.courses);
      return { ...r, status: r.code ? (passedCodes.has(r.code) ? "passed" as const : nowCodes.has(r.code) ? "in-progress" as const : "missing" as const) : null };
    });
    const ratingsView = c.code ? ratings[c.code] ?? null : null;
    return { courseId: c.id, code: c.code, name: c.name, ects: c.ects, ratings: ratingsView, recommendPct: recommendOf(ratingsView ?? undefined), cohorts, prerequisites, href: c.code ? `/next/${c.code}` : null };
  });
  const [year] = [next.year];
  return { term: year ? `Year ${year}` : null, ects: courses.reduce((n, c) => n + (c.ects ?? 0), 0), courses, phases, missing: false };
}

/** Figma 4.15 for one course. */
export async function cohorts(userId: string, code: string, now = new Date()): Promise<NextCourse | null> {
  const view = await nextSemester(userId, now);
  const hit = view?.courses.find((c) => c.code === code);
  if (hit) return hit;
  const [row] = await db().select({ id: lmsCourses.id, name: lmsCourses.name }).from(lmsCourses).where(eq(lmsCourses.code, code)).limit(1);
  return row ? { courseId: row.id, code, name: row.name, ects: null, ratings: null, recommendPct: null, cohorts: [], prerequisites: [], href: `/c/${code}` } : null;
}
