import { describe, expect, it } from "vitest";
import {
  codesIn, confidenceOf, courseCandidates, examGuess, exportDate, namesIn, notCourseFile, plainText, sourceKeyOf, termIn, termOf, titleGuess, typeGuess,
} from "@/core/import";
import { shownAs } from "@/core/uploads";

const COURSES = [
  { code: "MATH111", name: "Calculus 1" },
  { code: "MATH211", name: "Calculus 2" },
  { code: "ECON202", name: "Macroeconomics 1" },
  { code: "PHYS111", name: "Physics 2" },
  { code: "PHYS101", name: "Physics 1" },
  { code: "MATH202", name: "Advanced Linear Algebra" },
  { code: "MATH201", name: "Linear Algebra" },
  { code: "HASS111", name: "Academic and Communication Skills II" },
  { code: "CS221", name: "Object Oriented Programming" },
  { code: "MATH221", name: "Discrete Mathematics" },
  { code: "SE201", name: "Web Programming" },
  { code: "IT201", name: "Web Programming" },
];

describe("course codes", () => {
  it("reads codes with spaces, dashes, underscores or nothing between", () => {
    expect(codesIn("MATH 211 Calculus 2, Fall 20240.pdf")).toEqual(["MATH211"]);
    expect(codesIn("Syllabus-ECON-202 Macro-1 fall24.pdf")).toEqual(["ECON202"]);
    expect(codesIn("Syllabus-Phys111-Physics2.pdf")).toEqual(["PHYS111"]);
    expect(codesIn("PHYS111_Midterm_Exam_Fall_2024.pdf")).toEqual(["PHYS111"]);
    expect(codesIn("Money and Banking (ECON311) - Syllabus")).toEqual(["ECON311"]);
  });

  it("does not read years, weeks or words as codes", () => {
    expect(codesIn("Midterm2025 Fall 2024 fall24 Week 13 spr25 Final2025")).toEqual([]);
  });
});

describe("course names", () => {
  it("finds the whole name, shortened words, digits for roman numerals and initials", () => {
    expect(namesIn("Calculus2_midterm_answerts_fall2024.pdf", COURSES).map((h) => h.code)).toEqual(["MATH211"]);
    expect(namesIn("Macro-1 fall24", COURSES).map((h) => h.code)).toEqual(["ECON202"]);
    expect(namesIn("Discrete Math - Spring 2023 midterm", COURSES).map((h) => h.code)).toEqual(["MATH221"]);
    expect(namesIn("ACS 2 - Syllabus for Spring 2026", COURSES).map((h) => h.code)).toEqual(["HASS111"]);
    expect(namesIn("OOP - Spring 2025 midterm", COURSES).map((h) => h.code)).toEqual(["CS221"]);
  });

  it("keeps the longer name when one sits inside another", () => {
    expect(namesIn("Advanced Linear Algebra (MATH202) - Syllabus", COURSES).map((h) => h.code)).toEqual(["MATH202"]);
  });
});

describe("course candidates", () => {
  it("is certain when a known code and the name agree", () => {
    const c = courseCandidates({ fileName: "MATH111-Calculus 1 - Syllabus.pdf", text: "Calculus 1 - Syllabus" }, COURSES);
    expect(c[0]).toMatchObject({ code: "MATH111", score: 1 });
    expect(confidenceOf(c)).toBe("high");
  });

  it("matches on the name in the post when the file name says nothing", () => {
    const c = courseCandidates({ fileName: "solution.pdf", text: "#final  Final exam questions and solutions of Physics 1  @pumaterials" }, COURSES);
    expect(c[0].code).toBe("PHYS101");
    expect(c[0].reason).toContain("post");
    expect(confidenceOf(c)).toBe("high");
  });

  it("is ambiguous when two courses share the name", () => {
    const c = courseCandidates({ fileName: "Web Programming 2026.pdf", text: "Web programming - Syllabus" }, COURSES);
    expect(c.map((x) => x.code).sort()).toEqual(["IT201", "SE201"]);
    expect(confidenceOf(c)).toBe("ambiguous");
  });

  it("falls back to the PDF text, with less weight", () => {
    const none = courseCandidates({ fileName: "file.pdf", text: "" }, COURSES);
    expect(confidenceOf(none)).toBe("none");
    const c = courseCandidates({ fileName: "file.pdf", text: "", pdfText: "New Uzbekistan University. Course code: MATH 221. Discrete Mathematics" }, COURSES);
    expect(c[0]).toMatchObject({ code: "MATH221" });
    expect(c[0].reason).toContain("PDF text");
  });

  it("ignores the PDF when the name or post already found the course", () => {
    const c = courseCandidates({ fileName: "Calculus 2 Mock by Meros.pdf", text: "", pdfText: "PHYS 101 Physics 1" }, COURSES);
    expect(c.map((x) => x.code)).toEqual(["MATH211"]);
  });
});

describe("term, type, title", () => {
  it("reads the term in its usual spellings", () => {
    expect(termIn("Calculus2_midterm_answerts_fall2024.pdf")).toBe("Fall 2024");
    expect(termIn("Syllabus(fall24).docx.pdf")).toBe("Fall 2024");
    expect(termIn("(2025 Fall) CS360 Fundamentals of Software Engineering0.pdf")).toBe("Fall 2025");
    expect(termIn("Macro2_mock_questions_spr25 (1).pdf")).toBe("Spring 2025");
    expect(termIn("PHYS111_Midterm_Exam_Fall_2024.pdf")).toBe("Fall 2024");
    expect(termIn("Syllabus.pdf")).toBeNull();
  });

  it("prefers the post, then the file name, then the post date", () => {
    expect(termOf("x fall24.pdf", "Syllabus for Spring 2025", null)).toEqual({ term: "Spring 2025", from: "post" });
    expect(termOf("x fall24.pdf", "Syllabus", null)).toEqual({ term: "Fall 2024", from: "file name" });
    expect(termOf("Syllabus.pdf", "Linear algebra - Syllabus", exportDate("2024-12-18T10:00:00"))).toEqual({ term: "Fall 2024", from: "date" });
    expect(termOf("Syllabus.pdf", "", exportDate("2026-02-04T10:00:00"))).toEqual({ term: "Spring 2026", from: "date" });
  });

  it("guesses the type from the name and the post", () => {
    expect(typeGuess("Syllabus_19.pdf", "Physics 1 - Spring 2026")).toBe("syllabus");
    expect(typeGuess("solution.pdf", "#final Final exam questions and solutions of Physics 1")).toBe("exam");
    expect(typeGuess("Calculus2 Mock Exam.pdf", "")).toBe("mock");
    expect(typeGuess("Book.pdf", "#book Textbook of Physics")).toBe("book");
    expect(examGuess("PHYS111_Midterm_Exam_Fall_2024.pdf", "")).toBe("midterm");
    expect(examGuess("Physics 1 Resit.pdf", "Solutions of Physics 1 Resit exam")).toBe("final");
  });

  it("builds a clean title", () => {
    const course = { code: "PHYS101", name: "Physics 1" };
    expect(titleGuess({ fileName: "solution.pdf", text: "#final Final exam questions and solutions of Physics 1", type: "exam", exam: "final", term: "Spring 2025", course })).toBe("Final exam, Spring 2025, with solutions");
    expect(titleGuess({ fileName: "NUU_Physics1_syllabus.pdf", text: "", type: "syllabus", exam: null, term: null, course })).toBe("Syllabus");
    expect(titleGuess({ fileName: "Project Proposal Form.pdf.pdf", text: "", type: "other", exam: null, term: null, course })).toBe("Project Proposal Form");
    expect(titleGuess({ fileName: "ACFrOgD_qtPoVGn1ZvpQMJaChyVsa1rOf0Z6AqxwZI90DZkY_s5eS8gKNevBWWv.pdf", text: "Physics 1 lecture notes", type: "notes", exam: null, term: null, course })).toBe("Lecture notes");
  });

  it("flags files that are not one course's material", () => {
    expect(notCourseFile("Academic calendar - 2026-2027.pdf", "#calendar")).toBe("academic calendar");
    expect(notCourseFile("List of offered courses Spring 2026.pdf", "")).toBe("list of offered courses");
    expect(notCourseFile("Students - Published Mid-term Exams, Spring 2025.xlsx", "#midterm Exam schedule and rooms")).toBe("exam schedule");
    expect(notCourseFile("Calculus 1 - Final.pdf", "#calculus")).toBeNull();
  });
});

describe("export helpers", () => {
  it("joins rich text and keys posts", () => {
    expect(plainText(["Calculus 1 ", { type: "hashtag", text: "#midterm" }, "!"])).toBe("Calculus 1 #midterm!");
    expect(plainText(undefined)).toBe("");
    expect(sourceKeyOf("2486971545", 41)).toBe("tg:2486971545:41");
  });

  it("shows a channel import as the channel, never a person", () => {
    expect(shownAs(true, "Aziz T.", "the channel PU Materials")).toBe("From the channel PU Materials");
    expect(shownAs(false, null, null)).toBe("From students");
  });
});
