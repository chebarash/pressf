import { describe, expect, it } from "vitest";
import { cleanTitle } from "@/core/files";
import { termOfDate } from "@/core/semester";

describe("file titles from real LMS names", () => {
  const o = { courseCode: "CS412", courseName: "Deep Learning", teachers: ["Sejuti Rahman"] };
  it.each([
    ["Week_5_L910_v5.pdf", "Lectures 9–10"],
    ["Week 2_L3_L4_Sejuti Rahman.pdf", "Lectures 3–4"],
    ["Week 4_ L7_8_Sejuti Rahman.pdf", "Lectures 7–8"],
    ["CS412 Deep Learning — Midterm Review _Problem Solving_ _1_.pdf", "Midterm Review (Problem Solving)"],
    ["CS 412 DL_midterm guidelines_SR.pdf", "Midterm guidelines"],
    ["CS 412 Classic CNN Architectures and Transfer Learning _3_.pdf", "Classic CNN Architectures and Transfer Learning"],
    ["L12 Integrals.pdf", "Lecture 12 Integrals"],
  ])("%s → %s", (name, title) => expect(cleanTitle(name, o)).toBe(title));
});

describe("semester of a date", () => {
  it("names it by the month in Tashkent", () => {
    expect(termOfDate(new Date("2025-09-20T10:00:00Z"))).toBe("Fall 2025");
    expect(termOfDate(new Date("2026-01-10T10:00:00Z"))).toBe("Fall 2025");
    expect(termOfDate(new Date("2026-03-01T10:00:00Z"))).toBe("Spring 2026");
    expect(termOfDate(new Date("2026-07-01T10:00:00Z"))).toBe("Summer 2026");
  });
});
