import { describe, expect, it } from "vitest";
import { classify } from "@/lib/telegram/classify";

const courses = [
  { code: "MATH111", name: "Calculus 1" }, { code: "MATH211", name: "Calculus 2" },
  { code: "PHYS101", name: "Physics 1" }, { code: "PHYS111", name: "Physics 2" },
  { code: "MATH221", name: "Discrete Mathematics" },
];

describe("classify", () => {
  it("reads a code from a file name with underscores", () => {
    expect(classify("PHYS101_Midterm_Exam_Fall_2024.pdf", null, courses)).toMatchObject({ courseCode: "PHYS101", courseName: "Physics 1", type: "midterm", term: "Fall 2024" });
  });
  it("prefers the caption over a vague file name", () => {
    expect(classify("Syllabus.pdf", "Calculus 2 - Syllabus", courses)).toMatchObject({ courseCode: "MATH211", type: "syllabus" });
  });
  it("matches the hashtag form of a course name", () => {
    expect(classify("x.pdf", "#physics1 final exam", courses).courseCode).toBe("PHYS101");
  });
  it("picks the longest course name", () => {
    expect(classify("Calculus 1 - Final.pdf", null, courses).courseCode).toBe("MATH111");
  });
  it("does not read a year as a course code", () => {
    expect(classify("Academic calendar for the 2026-2027.pdf", null, courses).courseCode).toBeNull();
    expect(classify("CS100 Fall 2025 26 Aug 2025.pdf", null, courses).courseCode).toBe("CS100");
  });
  it("keeps upper case codes with four digits", () => {
    expect(classify("Syllabus_SE2010.pdf", null, courses).courseCode).toBe("SE2010");
  });
  it("detects every material type", () => {
    const type = (name: string) => classify(name, null, courses).type;
    expect(type("x syllabus.pdf")).toBe("syllabus");
    expect(type("x mock.pdf")).toBe("mock");
    expect(type("x mid-term.pdf")).toBe("midterm");
    expect(type("x resit.pdf")).toBe("final");
    expect(type("x 9th edition.pdf")).toBe("textbook");
    expect(type("lecture slides.pdf")).toBe("notes");
    expect(type("random.pdf")).toBeNull();
  });
  it("reads terms in all their forms", () => {
    const term = (name: string) => classify(name, null, courses).term;
    expect(term("x fall24.pdf")).toBe("Fall 2024");
    expect(term("x spr25.pdf")).toBe("Spring 2025");
    expect(term("x 2025 Summer.pdf")).toBe("Summer 2025");
    expect(term("x.pdf")).toBeNull();
  });
  it("detects solutions", () => {
    expect(classify("x marking scheme.pdf", null, courses).hasSolutions).toBe(true);
    expect(classify("x.pdf", null, courses).hasSolutions).toBe(false);
  });
  it("credits mock authors and ignores channel handles", () => {
    expect(classify("Discrete Mock by Timurid.pdf", null, courses).author).toBe("Timurid");
    expect(classify("x.pdf", "Mock by @pumaterials", courses).author).toBeNull();
    expect(classify("notes by Someone.pdf", null, courses).author).toBeNull();
  });
});
