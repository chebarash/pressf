import { describe, expect, it } from "vitest";
import { codePrefix, isMoveTarget, place, placeByCode, placeByTeachers, unitOf } from "@/core/placement";

describe("course placement", () => {
  const lecturer = (department: string | null, school: string | null = null) => ({ department, school, role: "Lecture" });
  const lab = (department: string | null, school: string | null = null) => ({ department, school, role: "Laboratory" });

  it("puts an admin's move over the LMS, the teachers and the code", () => {
    expect(place({ code: "CS101", override: { school: "School of Management", department: "Industrial Management" }, lms: ["Computer Science"], teachers: [lecturer("Department of AI")] }))
      .toEqual({ school: "School of Management", department: "Industrial Management", by: "override" });
    expect(place({ code: "CS101", override: { school: "School of Engineering", department: null } })).toMatchObject({ school: "School of Engineering", department: "School-wide", by: "override" });
  });

  it("uses the LMS department when named, mapped onto the university's schools", () => {
    expect(place({ code: "ECON101", lms: ["Computer Science"], teachers: [lecturer("Department of Economics")] })).toEqual({ school: "School of Computing", department: "Computer Science", by: "lms" });
    expect(place({ code: "X1", lms: ["Chemical and Materials Engineering"] })).toMatchObject({ school: "School of Engineering", department: "Chemical Engineering & Materials Sciences" });
    expect(place({ code: "X1", lms: ["Medicine department"] })).toMatchObject({ school: "School of Medicine", department: "Medicine" });
    expect(place({ code: "X1", lms: ["Agrotechnology"] })).toMatchObject({ school: "School of Agrotechnologies", department: "Agrotechnologies" });
    // An LMS school → department chain we do not know stays as the LMS has it.
    expect(place({ code: "X1", lms: ["School of Law", "Civil Law"] })).toMatchObject({ school: "School of Law", department: "Civil Law", by: "lms" });
  });

  it("falls back to the department most teachers belong to, lecturers weighted highest", () => {
    // One lecturer (3) outweighs two lab teachers (2).
    expect(place({ code: "ECON101", lms: [], teachers: [lecturer("Department of Mathematics", "School of Humanities, Natural and Social Sciences"), lab("Department of Physics"), lab("Department of Physics")] }))
      .toEqual({ school: "School of Humanities, Natural and Social Sciences", department: "Mathematics", by: "teachers" });
    // Three lab teachers (3) tie with one lecturer (3): the lecturer's department wins.
    expect(placeByTeachers([lab("Department of Physics"), lab("Department of Physics"), lab("Department of Physics"), lecturer("Department of Economics")])).toMatchObject({ department: "Economics" });
    // A teacher listed under a school only places the course in that school.
    expect(placeByTeachers([lecturer(null, "School of Computing")])).toEqual({ school: "School of Computing", department: "School-wide" });
    expect(placeByTeachers([lecturer(null, "School of Medicine")])).toEqual({ school: "School of Medicine", department: "Medicine" });
    // Deans and teachers with nothing known do not vote.
    expect(placeByTeachers([lecturer("Deans of Specialized Schools"), lecturer(null)])).toBeNull();
  });

  it("then the code prefix, and only then Unassigned", () => {
    expect(place({ code: "ECON231X", lms: [], teachers: [lecturer(null)] })).toEqual({ school: "School of Humanities, Natural and Social Sciences", department: "Economics", by: "code" });
    expect(placeByCode("MENG201")).toEqual({ school: "School of Engineering", department: "Mechanical Engineering" });
    expect(placeByCode("gmgt501")).toEqual({ school: "School of Management", department: "Industrial Management" });
    expect(placeByCode("AGR600")).toMatchObject({ school: "School of Agrotechnologies" });
    expect(place({ code: "GRAD601" })).toEqual({ school: "Unassigned", department: "Unassigned", by: null });
    expect(codePrefix(" cs30 ")).toBe("CS");
  });

  it("keeps the code map in line with the LMS departments of courses whose department is known", () => {
    const known: Array<[string, string]> = [["CENG201", "Chemical and Materials Engineering"], ["CHEM201", "Chemical and Materials Engineering"], ["CS100", "Computer Science"], ["DSG101", "Computer Science"], ["SE202", "Computer Science"], ["AGR600", "Agrotechnology"], ["MD101", "Medicine department"], ["BIO101", "Medicine department"]];
    for (const [code, lms] of known) expect(placeByCode(code)?.school, code).toBe(unitOf(lms)?.school);
  });

  it("accepts moves only to a listed school and department", () => {
    expect(isMoveTarget("School of Computing", "AI")).toBe(true);
    expect(isMoveTarget("School of Computing", null)).toBe(true);
    expect(isMoveTarget("School of Computing", "Physics")).toBe(false);
    expect(isMoveTarget("Hogwarts", null)).toBe(false);
  });
});
