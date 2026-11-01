import { describe, expect, it } from "vitest";
import { findSyllabusCourse, isStated, matchesCourse, syllabusFlags, termRank, titleKey } from "@/lib/syllabus";
import { course, syllabus } from "../fixtures/catalog";

const courses = [course("MATH111", "Calculus 1"), course("HASS111", "Academic and Communication Skills 2"), course("CS111", "Algorithms & Data Struсtures"), course("ECON201", "Microeconomics 2")];

describe("titleKey", () => {
  it("treats spellings of one title alike", () => {
    expect(titleKey("Academic and Communication Skills II")).toBe(titleKey("Academic & Communication Skills 2"));
    expect(titleKey("Algorithms & Data Struсtures")).toBe(titleKey("Algorithms and Data Structures"));
    expect(titleKey("Microeconomics 2 (Intermediate)")).toBe("microeconomics 2");
  });
});

describe("matchesCourse", () => {
  it("needs both the code and the title", () => {
    expect(matchesCourse({ course_code: "MATH 111", course_title: "Calculus 1" }, courses)).toBe(true);
    expect(matchesCourse({ course_code: "HASS 111", course_title: "Academic and Communication Skills II" }, courses)).toBe(true);
  });
  it("rejects a reused code with another title", () => {
    expect(matchesCourse({ course_code: "ECON 201", course_title: "Microeconomics I" }, courses)).toBe(false);
  });
  it("rejects a code missing from the catalog", () => {
    expect(matchesCourse({ course_code: "SE201", course_title: "Web Programming" }, courses)).toBe(false);
  });
});

describe("findSyllabusCourse", () => {
  const list = [course("ECON102", "Macroeconomics 1"), course("ECON201", "Microeconomics 2"), course("ECON202", "Macroeconomics 2"), course("CS411", "Compilers", { same_name_codes: ["CS620"] }), course("CS620", "Compilers", { same_name_codes: ["CS411"] })];
  it("follows a renumbered course by its title", () => {
    expect(findSyllabusCourse({ course_code: "ECON-202", course_title: "MACROECONOMICS-1" }, list)).toBe("ECON102");
    expect(findSyllabusCourse({ course_code: "ECON211", course_title: "Microeconomics 2 (Intermediate Microeconomics)" }, list)).toBe("ECON201");
  });
  it("keeps a correct pair and leaves unknown titles alone", () => {
    expect(findSyllabusCourse({ course_code: "ECON 202", course_title: "Macroeconomics 2" }, list)).toBe("ECON202");
    expect(findSyllabusCourse({ course_code: "SE201", course_title: "Web Programming" }, list)).toBeNull();
  });
  it("never guesses between courses with one name", () => {
    expect(findSyllabusCourse({ course_code: "CS999", course_title: "Compilers" }, list)).toBeNull();
  });
});

describe("syllabusFlags", () => {
  it("passes a clean syllabus", () => expect(syllabusFlags(syllabus(), courses)).toEqual([]));
  it("flags weights that do not add up", () => {
    const data = syllabus({ assessment: [{ name: "Final", weight_percent: 90, timing: "" }] });
    expect(syllabusFlags(data, courses)).toContain("Assessment weights add up to 90%.");
  });
  it("flags hours that disagree", () => {
    const flags = syllabusFlags(syllabus({ total_hours: 240, ects: 8 }), courses);
    expect(flags).toContain("The workload adds up to 180, the syllabus says 240.");
  });
  it("flags ECTS that disagree with hours", () => {
    expect(syllabusFlags(syllabus({ ects: 8 }), courses)).toContain("8 ECTS should mean 240 hours, the syllabus says 180.");
  });
  it("flags a course that needs itself", () => {
    const data = syllabus({ prerequisites: { status: "listed", groups: [{ any_of: [{ text: "MATH 111", code: "MATH 111" }] }] } });
    expect(syllabusFlags(data, courses)).toContain("The course lists itself as a prerequisite.");
  });
  it("flags unknown and conflicting courses", () => {
    expect(syllabusFlags(syllabus({ course_code: "SE201" }), courses)[0]).toMatch(/not in the course catalog/);
    expect(syllabusFlags(syllabus({ course_code: "ECON201", course_title: "Micro I" }), courses)[0]).toMatch(/catalog calls ECON201/);
  });
});

describe("termRank", () => {
  it("sorts newest first and fall after spring", () => {
    const rank = (term: string, academic_year = "") => termRank(syllabus({ term, academic_year }));
    expect(rank("Fall 2024")).toBeGreaterThan(rank("Spring 2024"));
    expect(rank("Spring 2026")).toBeGreaterThan(rank("Fall 2024", "2024/2025"));
    expect(rank("Spring", "2025")).toBeGreaterThan(0);
    expect(rank("Spring 2025", "2024/2025")).toBeGreaterThan(rank("Fall 2024", "2024/2025"));
    expect(rank("Spring", "2024/2025")).toBeGreaterThan(rank("Fall", "2024/2025"));
  });
});

describe("isStated", () => {
  it("hides placeholders", () => {
    for (const value of ["TBA", "tbd", "n/a", "-", "", null, undefined]) expect(isStated(value)).toBe(false);
    expect(isStated("Mon 12pm")).toBe(true);
  });
});
