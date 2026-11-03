import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lms = vi.hoisted(() => ({ departments: vi.fn(), programs: vi.fn(), subject: vi.fn() }));
vi.mock("@/lib/lms/client", () => lms);

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lmsCourseTeachers, lmsCourses, lmsDepartments, lmsPrograms, lmsTeachers } from "@/lib/db/schema";
import { harvestCatalog } from "@/lib/lms/harvest";
import { resetDb } from "../fixtures/db";

const session = { token: "t" };

const course = (id: number, code: string, employee: object[] = []) => ({
  id: String(id), code, name: `Course ${code}`, credit_count: "6", lecture_hours: "30",
  department: { id: "2", name: "CS" }, semester_id: "181", employee,
});
const emp = (id: string, first: string, role: string) => ({ employee_id: id, first_name_en: first, last_name_en: "Doe", sur_name_en: "D", employee_type: role });

beforeEach(async () => {
  await resetDb();
  lms.departments.mockResolvedValue([{ id: "2", code: "60010", parent_id: "4", name: "Computer Science", short_name: "cs" }]);
  lms.programs.mockResolvedValue([{ id: "23", name: "Software Engineering", department_id: "2" }]);
});
afterEach(() => vi.clearAllMocks());

describe("harvestCatalog", () => {
  it("stores departments, programs, courses and teachers, and stops after the gap", async () => {
    const present: Record<number, ReturnType<typeof course>> = {
      1: course(1, "CS101", [emp("9", "Ann", "Lecture")]),
      2: course(2, "CS102", [emp("9", "Ann", "Lecture"), emp("10", "Bob", "Laboratory")]),
    };
    lms.subject.mockImplementation(async (_s, id: number) => present[id] ?? { id: String(id), employee: [], landings: [] });

    const result = await harvestCatalog(session, { stopGap: 20, maxId: 500 });
    expect(result).toMatchObject({ departments: 1, programs: 1, courses: 2, lastCourseId: 2 });
    // It stopped ~20 past the last course instead of scanning to maxId.
    expect(result.scannedTo).toBeLessThan(40);

    expect(await db().select().from(lmsDepartments)).toHaveLength(1);
    expect(await db().select().from(lmsPrograms)).toHaveLength(1);
    expect(await db().select().from(lmsCourses)).toHaveLength(2);
    const teachers = await db().select().from(lmsTeachers);
    expect(teachers.map((t) => t.firstName).sort()).toEqual(["Ann", "Bob"]);
    const links = await db().select().from(lmsCourseTeachers).where(eq(lmsCourseTeachers.courseId, "2"));
    expect(links).toHaveLength(2);
  });

  it("skips deleted or nameless courses without crashing, and keeps scanning past them", async () => {
    const present: Record<number, object> = {
      1: course(1, "CS101", [emp("9", "Ann", "Lecture")]),
      2: { id: "2", code: "GRAD490", name: null, deleted: "1", employee: [] }, // deleted, name null
      3: { id: "3", code: "OLD100", name: null, employee: [] }, // nameless
      4: course(4, "CS102", [emp("9", "Ann", "Lecture")]),
    };
    lms.subject.mockImplementation(async (_s, id: number) => present[id] ?? { id: String(id), employee: [], landings: [] });
    const r = await harvestCatalog(session, { stopGap: 20, maxId: 100 });
    expect(r.courses).toBe(2); // only CS101 and CS102 stored
    expect(r.lastCourseId).toBe(4); // scan continued past the skipped ids
    expect((await db().select().from(lmsCourses)).map((c) => c.code).sort()).toEqual(["CS101", "CS102"]);
  });

  it("tolerates duplicate department and program ids from the LMS", async () => {
    lms.departments.mockResolvedValue([{ id: "2", name: "CS" }, { id: "2", name: "CS again" }]);
    lms.programs.mockResolvedValue([{ id: "23", name: "SE" }, { id: "23", name: "SE again" }]);
    lms.subject.mockResolvedValue({ id: "1", employee: [], landings: [] });
    // Must not throw "ON CONFLICT ... cannot affect row a second time".
    const r = await harvestCatalog(session, { stopGap: 5, maxId: 10 });
    expect(r).toMatchObject({ departments: 1, programs: 1 });
  });

  it("re-running updates in place and drops a teacher who left a course", async () => {
    lms.subject.mockImplementation(async (_s, id: number) =>
      id === 1 ? course(1, "CS101", [emp("9", "Ann", "Lecture"), emp("10", "Bob", "Laboratory")]) : { id: String(id), employee: [] }
    );
    await harvestCatalog(session, { stopGap: 10, maxId: 100 });
    expect(await db().select().from(lmsCourseTeachers)).toHaveLength(2);

    // Bob no longer teaches CS101.
    lms.subject.mockImplementation(async (_s, id: number) =>
      id === 1 ? course(1, "CS101 Renamed", [emp("9", "Ann", "Lecture")]) : { id: String(id), employee: [] }
    );
    await harvestCatalog(session, { stopGap: 10, maxId: 100 });

    const [c] = await db().select().from(lmsCourses).where(eq(lmsCourses.id, "1"));
    expect(c.code).toBe("CS101 Renamed");
    expect(await db().select().from(lmsCourses)).toHaveLength(1);
    const links = await db().select().from(lmsCourseTeachers).where(eq(lmsCourseTeachers.courseId, "1"));
    expect(links.map((l) => l.teacherId)).toEqual(["9"]);
  });

  it("keeps a course's lessons when the harvesting account is not enrolled (the LMS then sends none)", async () => {
    const slot = { begin_time: "1789374600", end_time: "1789377900", auditorium: "306", employee_id: "9", employee: { employee_id: "9" } };
    const enrolled = { ...course(1, "CS412", [emp("9", "Ann", "")]), lessons: [{ id: "52667", name: "Lecture 1", lessonType: { name: "Lecture" }, schedule: [slot] }] };
    lms.subject.mockImplementation(async (_s, id: number) => (id === 1 ? enrolled : { id: String(id), employee: [] }));
    await harvestCatalog(session, { stopGap: 5, maxId: 10 });
    // Next run, another account: same course, no lessons.
    lms.subject.mockImplementation(async (_s, id: number) => (id === 1 ? { ...course(1, "CS412", [emp("9", "Ann", "")]), lessons: [] } : { id: String(id), employee: [] }));
    await harvestCatalog(session, { stopGap: 5, maxId: 10 });
    const [c] = await db().select().from(lmsCourses).where(eq(lmsCourses.id, "1"));
    expect((c.raw as { lessons: unknown[] }).lessons).toHaveLength(1);
    // The role still comes from the lessons ("Lecture"), not a blank employee type.
    expect((await db().select().from(lmsCourseTeachers)).map((l) => l.role)).toEqual(["Lecture"]);
  });
});
