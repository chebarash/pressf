import { beforeEach, describe, expect, it } from "vitest";
import { coverageCsv, coverageReport, currentSemester, materialsCsv, suggest, type CoverageInput } from "@/core/coverage";
import { db } from "@/lib/db";
import {
  lmsAccounts, lmsCache, lmsCourses, lmsCurricula, lmsDepartments, lmsFiles, lmsPrograms, lmsSemesters, syllabi, uploads, userState, users, type SyllabusData,
} from "@/lib/db/schema";
import { coverageNow } from "@/server/admin/coverage";
import { resetDb } from "../fixtures/db";

const NOW = new Date("2026-11-04T10:00:00Z");
const newUser = async (email: string) => (await db().insert(users).values({ email }).returning())[0].id;
const course = (id: string, code: string, name: string, departmentId: string, semesterId: string) => ({ id, code, name, departmentId, semesterId, raw: {} });
const plan = (semesterId: string, year: number, codes: Array<[string, string]>) => ({ semesterId, year, courses: codes.map(([id, code]) => ({ id, code, name: code, ects: 6 })) });
const file = (id: string, courseId: string, code: string, at: string) => ({ id, courseId, code, name: `${id}.pdf`, storageKey: `k/${id}`, lmsUpdatedAt: new Date(at) });
const upload = (courseId: string, courseCode: string | null, type: string, status: "live" | "waiting" = "live") => ({
  courseId, courseCode, title: "t", type, status, fileName: "a.pdf", mimeType: "application/pdf", size: 1, sha256: crypto.randomUUID(), createdAt: new Date("2026-02-01T00:00:00Z"),
});
const snapshot = (courses: Array<[string, string]>, open: string[]) => ({
  lms: { semesters: [...new Set(courses.map((c) => c[1]))].map((id) => ({ id, open: open.includes(id) })), courses: courses.map(([subjectId, semesterId]) => ({ subjectId, semesterId })) },
});

beforeEach(async () => {
  await resetDb();
  await db().insert(lmsDepartments).values([
    { id: "1", name: "School of Engineering" },
    { id: "2", parentId: "1", name: "Mechanical Engineering" },
    { id: "3", name: "School of Computing" },
    { id: "4", parentId: "3", name: "Software Engineering" },
  ]);
  await db().insert(lmsPrograms).values([
    { id: "P1", name: "Mechanical Engineering", departmentId: "2" },
    { id: "P2", name: "Software Engineering", departmentId: "4" },
  ]);
  await db().insert(lmsSemesters).values([
    { id: "179", name: "Spring 2026", starts: "2026-01-20", ends: "2026-06-10" },
    { id: "181", name: "Fall (2026-2027)", starts: "2026-09-01", ends: "2027-01-15" },
  ]);
  await db().insert(lmsCourses).values([
    course("401", "ME201", "Statics", "2", "179"),
    course("501", "ME201", "Statics", "2", "181"),
    course("502", "ME202", "Dynamics", "2", "181"),
    course("503", "ME203", "Materials", "2", "181"),
    course("504", "ME301", "Heat Transfer", "2", "181"),
    course("601", "CS201", "Data Structures", "4", "181"),
    course("602", "CS202", "Databases", "4", "181"),
  ]);
  await db().insert(lmsCurricula).values([
    { workEducationPlanId: "70", programId: "P1", data: { programId: "P1", semesters: [plan("179", 1, [["401", "ME201"]]), plan("181", 2, [["501", "ME201"], ["502", "ME202"], ["503", "ME203"]])] } },
    { workEducationPlanId: "71", programId: "P1", data: { programId: "P1", semesters: [plan("181", 3, [["504", "ME301"], ["503", "ME203"]])] } },
    { workEducationPlanId: "80", programId: "P2", data: { programId: "P2", semesters: [plan("181", 2, [["601", "CS201"], ["602", "CS202"]])] } },
  ]);

  // u1: active, takes CS201 now (and took ME201 last semester, which does not count).
  const u1 = await newUser("u1@newuu.uz");
  await db().insert(lmsAccounts).values({ userId: u1, sealedPassword: "v1.sealed" });
  await db().insert(userState).values({ userId: u1, snapshot: snapshot([["601", "181"], ["401", "179"]], ["181"]) });
  // u2: active, only the sign-in enrollment (codes) so far.
  const u2 = await newUser("u2@newuu.uz");
  await db().insert(lmsAccounts).values({ userId: u2, sealedPassword: "v1.sealed" });
  await db().insert(lmsCache).values({ userId: u2, data: { enrollment: { codes: ["cs202", "CS201"] } } });
  // u3: changed their LMS password, so their ME201 no longer counts.
  const u3 = await newUser("u3@newuu.uz");
  await db().insert(lmsAccounts).values({ userId: u3, sealedPassword: "v1.sealed", status: "invalid" });
  await db().insert(userState).values({ userId: u3, snapshot: snapshot([["501", "181"]], ["181"]) });

  await db().insert(lmsFiles).values([
    file("f1", "401", "ME201", "2026-03-01T00:00:00Z"),
    file("f2", "401", "ME201", "2026-04-02T00:00:00Z"),
    file("f3", "601", "CS201", "2026-10-01T00:00:00Z"),
  ]);
  await db().insert(uploads).values([
    upload("501", "ME201", "exam"),
    upload("501", "ME201", "notes", "waiting"),
    upload("502", null, "mock"),
  ]);
  await db().insert(syllabi).values({ courseCode: "CS201", sourceName: "cs201.pdf", matched: true, data: {} as SyllabusData });
  await db().insert(syllabi).values({ courseCode: "ME301", sourceName: "me301.pdf", matched: false, data: {} as SyllabusData });
});

describe("coverage report", () => {
  it("counts courses running now as covered only when an active student takes them", async () => {
    const r = await coverageNow(NOW);
    expect(r.semester).toEqual({ id: "181", name: "Fall 2026" });
    expect(r.totals).toMatchObject({ running: 6, covered: 2, pct: 33, students: 2, activeAccounts: 2 });
    const byCode = Object.fromEntries(r.courses.map((c) => [c.code, c]));
    expect(byCode.CS201).toMatchObject({ covered: true, students: 2, faculty: "School of Computing", department: "Software Engineering" });
    expect(byCode.CS202).toMatchObject({ covered: true, students: 1 });
    expect(byCode.ME201).toMatchObject({ covered: false, students: 0, cohorts: [{ programId: "P1", program: "Mechanical Engineering", year: 2 }] });
    expect(byCode.ME203.cohorts.map((c) => c.year)).toEqual([2, 3]);

    // Least covered faculty first, with its school → department rows and the missing courses.
    expect(r.faculties.map((f) => [f.name, f.covered, f.running, f.pct])).toEqual([["School of Engineering", 0, 4, 0], ["School of Computing", 2, 2, 100]]);
    const eng = r.faculties[0];
    expect(eng.uncovered).toEqual(["ME201", "ME202", "ME203", "ME301"]);
    expect(eng.schools[0]).toMatchObject({ name: "Mechanical Engineering", running: 4, covered: 0 });
    expect(r.faculties[1].students).toBe(2);
  });

  it("suggests cohorts in the order that covers the most missing courses", async () => {
    const r = await coverageNow(NOW);
    expect(r.suggestions.map((s) => [s.program, s.year, s.uncovered, s.total, s.gain, s.courses.map((c) => c.code)])).toEqual([
      ["Mechanical Engineering", 2, 3, 3, 3, ["ME201", "ME202", "ME203"]],
      ["Mechanical Engineering", 3, 2, 2, 1, ["ME301"]],
    ]);
    expect(r.totals.noCohort).toBe(0);
  });

  it("counts materials per course: LMS files of any offering, live uploads, past exams, matched syllabi", async () => {
    const r = await coverageNow(NOW);
    const byCode = Object.fromEntries(r.courses.map((c) => [c.code, c]));
    expect(byCode.ME201).toMatchObject({ lmsFiles: 2, uploads: 1, exams: 1, syllabus: false, lastFile: "2026-04-02T00:00:00.000Z" });
    expect(byCode.ME202).toMatchObject({ lmsFiles: 0, uploads: 1, exams: 1 });
    expect(byCode.CS201).toMatchObject({ lmsFiles: 1, uploads: 0, syllabus: true });
    expect(byCode.ME301).toMatchObject({ lmsFiles: 0, uploads: 0, syllabus: false });
    expect(r.totals).toMatchObject({ noFiles: 3, lmsOnly: 1 });
    expect(r.faculties[0].materials).toEqual({ courses: 4, lmsFiles: 2, uploads: 2, exams: 2, syllabi: 0, noFiles: 2, lmsOnly: 0 });
    expect(r.programs.map((p) => p.id)).toEqual(["P1", "P2"]);
    expect(r.years).toEqual([2, 3]);
  });

  it("exports both tables as CSV", async () => {
    const r = await coverageNow(NOW);
    const cov = coverageCsv(r).split("\n");
    expect(cov[0]).toBe("faculty,school,department,code,course,cohorts,students,covered");
    expect(cov).toContain("School of Engineering,Mechanical Engineering,Mechanical Engineering,ME203,Materials,Year 2 · Mechanical Engineering; Year 3 · Mechanical Engineering,0,no");
    const mat = materialsCsv(r).split("\n");
    expect(mat[0]).toBe("faculty,school,code,course,cohorts,lms_files,student_uploads,past_exams,syllabus,last_file");
    expect(mat).toContain("School of Computing,Software Engineering,CS201,Data Structures,Year 2 · Software Engineering,1,0,0,yes,2026-10-01");
  });
});

describe("coverage rules", () => {
  const base: Pick<CoverageInput, "today" | "semesters" | "courses" | "enrollments"> = {
    today: "2026-11-04",
    semesters: [{ id: "181", name: "Fall 2026", starts: "2026-09-01", ends: "2027-01-15" }],
    courses: [{ id: "1", code: "A", name: "A", departmentId: null, semesterId: "182" }],
    enrollments: [],
  };
  it("picks the semester students have open, else today's dates, else the newest harvested", () => {
    expect(currentSemester({ ...base, enrollments: [{ userId: "u", courseId: "1", code: null, semesterId: "180" }] })).toBe("180");
    expect(currentSemester(base)).toBe("181");
    expect(currentSemester({ ...base, semesters: [] })).toBe("182");
  });

  it("recruits greedily and stops when nothing new is covered", () => {
    const cohorts = [
      { programId: "a", program: "A", faculty: "F", year: 1, total: 2, codes: ["X", "Y"] },
      { programId: "b", program: "B", faculty: "F", year: 1, total: 3, codes: ["X", "Y", "Z"] },
      { programId: "c", program: "C", faculty: "F", year: 1, total: 1, codes: ["Q"] },
    ];
    const out = suggest(cohorts, new Set(["Q"]), new Map());
    expect(out.map((s) => [s.programId, s.gain])).toEqual([["b", 3]]);
  });

  it("drops a lone university root so faculties are its children; unknown departments are Unassigned", () => {
    const r = coverageReport({
      ...base,
      departments: [{ id: "u", parentId: null, name: "University" }, { id: "s", parentId: "u", name: "School of Law" }],
      programs: [],
      courses: [
        { id: "1", code: "LAW1", name: "Law", departmentId: "s", semesterId: "181" },
        { id: "2", code: "X1", name: "X", departmentId: null, semesterId: "181" },
      ],
      materials: [],
      plans: [],
      activeAccounts: 0,
    });
    expect(r.faculties.map((f) => f.name).sort()).toEqual(["School of Law", "Unassigned"]);
    expect(r.totals.noCohort).toBe(2);
  });
});
