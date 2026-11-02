import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { lmsCourseTeachers, lmsCourses, lmsCurricula, lmsDepartments, lmsPrograms, lmsTeachers } from "@/lib/db/schema";
import { getCatalog } from "@/lib/catalog";
import { resetDb } from "../fixtures/db";

beforeEach(() => resetDb());

describe("getCatalog with harvested LMS data", () => {
  it("builds courses and teachers from the LMS tables when present", async () => {
    await db().insert(lmsDepartments).values({ id: "2", name: "Computer Science", shortName: "cs" });
    await db().insert(lmsTeachers).values([
      { id: "9", firstName: "Ann", surName: "Lee" },
      { id: "10", firstName: "Bob", surName: "Kim" },
    ]);
    await db().insert(lmsCourses).values([
      { id: "100", code: "CS101", name: "Intro to CS", credits: 6, departmentId: "2", raw: {} },
      { id: "101", code: "CS201", name: "Data Structures", credits: 6, departmentId: "2", raw: {} },
    ]);
    await db().insert(lmsCourseTeachers).values([
      { courseId: "100", teacherId: "9", role: "Lecture" },
      { courseId: "100", teacherId: "10", role: "Laboratory" },
      { courseId: "101", teacherId: "9", role: "Lecture" },
    ]);

    const catalog = await getCatalog();

    expect(catalog.courses.map((c) => c.code).sort()).toEqual(["CS101", "CS201"]);
    const cs101 = catalog.courses.find((c) => c.code === "CS101")!;
    expect(cs101.subject).toBe("Intro to CS");
    expect(cs101.teachers.sort()).toEqual(["10", "9"]);

    // Teacher id is the LMS employee id; name and department come from the LMS.
    const ann = catalog.teachers.find((t) => t.id === "9")!;
    expect(ann.display_name).toBe("Ann Lee");
    expect(ann.department).toBe("Computer Science");
    expect(ann.teaches.sort()).toEqual(["CS101", "CS201"]);
  });

  it("builds schools and a program curriculum from the LMS", async () => {
    await db().insert(lmsDepartments).values([
      { id: "4", parentId: null, name: "School of Computing" },
      { id: "2", parentId: "4", name: "Computer Science" },
    ]);
    await db().insert(lmsPrograms).values({ id: "23", name: "Software Engineering", departmentId: "2" });
    await db().insert(lmsCourses).values({ id: "100", code: "CS101", name: "Intro to CS", raw: {} });
    await db().insert(lmsCurricula).values({
      workEducationPlanId: "7", programId: "23",
      data: { programId: "23", semesters: [{ semesterId: "10", year: 1, courses: [{ id: "100", code: "CS101", name: "Intro to CS", ects: 6 }] }] },
    });

    const catalog = await getCatalog();
    const school = catalog.schools.find((s) => s.name === "School of Computing")!;
    expect(school.programs.map((p) => p.name)).toEqual(["Software Engineering"]);
    const curriculum = catalog.curricula[school.programs[0].slug];
    expect(curriculum.semesters[0].courses[0]).toMatchObject({ code: "CS101", subject: "Intro to CS", credits: 6 });
  });

  it("merges several subject ids that share one course code", async () => {
    await db().insert(lmsTeachers).values([{ id: "9", firstName: "Ann", surName: "Lee" }, { id: "11", firstName: "Cy", surName: "Park" }]);
    await db().insert(lmsCourses).values([
      { id: "100", code: "CS101", name: "Intro to CS", raw: {} },
      { id: "500", code: "CS101", name: "Intro to CS", raw: {} },
    ]);
    await db().insert(lmsCourseTeachers).values([
      { courseId: "100", teacherId: "9", role: "Lecture" },
      { courseId: "500", teacherId: "11", role: "Lecture" },
    ]);
    const catalog = await getCatalog();
    const list = catalog.courses.filter((c) => c.code === "CS101");
    expect(list).toHaveLength(1);
    expect(list[0].teachers.sort()).toEqual(["11", "9"]);
  });
});
