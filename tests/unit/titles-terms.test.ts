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

describe("hyphens inside words stay", () => {
  it("keeps Mid-term and splits spaced dashes", () => {
    expect(cleanTitle("Mid-term guideline.pdf")).toBe("Mid-term guideline");
    expect(cleanTitle("ToC - T1.pdf")).toBe("ToC — Tutorial 1");
    expect(cleanTitle("Week 3: Graphs.pdf")).toBe("Graphs");
  });
});

import { kindOf, mergeBlocks } from "@/core/agenda";
describe("a lecture and the lab after it stay two classes", () => {
  it("does not merge different kinds, even back to back in one room", () => {
    const d = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 2, h, m));
    const blocks = mergeBlocks([
      { courseId: "906", courseName: "Deep Learning", kind: kindOf("Lecture"), start: d(3, 30), end: d(4, 25), room: "306" },
      { courseId: "906", courseName: "Deep Learning", kind: kindOf("Lecture"), start: d(4, 30), end: d(5, 25), room: "306" },
      { courseId: "906", courseName: "Deep Learning", kind: kindOf("Laboratory"), start: d(5, 30), end: d(6, 25), room: "306" },
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(["lecture", "lab"]);
  });
});

describe("hours with different teachers stay apart", () => {
  it("does not merge the same course and kind across two teachers", () => {
    const d = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 2, h, m));
    const blocks = mergeBlocks([
      { courseId: "906", courseName: "Deep Learning", kind: "other", teacherId: "141", start: d(3, 30), end: d(4, 25) },
      { courseId: "906", courseName: "Deep Learning", kind: "other", teacherId: "141", start: d(4, 30), end: d(5, 25) },
      { courseId: "906", courseName: "Deep Learning", kind: "other", teacherId: "215", start: d(5, 30), end: d(6, 25) },
    ]);
    expect(blocks.map((b) => b.teacherId)).toEqual(["141", "215"]);
  });
});

import { roomLabel } from "@/core/agenda";
describe("rooms with their building", () => {
  it("prefixes the LMS campus without dots", () => {
    expect(roomLabel({ aud_num: "306", campus: { name: "M.A.T.H." } })).toBe("MATH 306");
    expect(roomLabel({ aud_num: "209", campus: { name: "U.C.A." } })).toBe("UCA 209");
    expect(roomLabel({ aud_num: "115" })).toBe("115");
    expect(roomLabel("B-204")).toBe("B-204");
  });
});

import { CLASS_KIND_LABEL, kindOfLessonType } from "@/core/agenda";
describe("LMS lesson types by number", () => {
  it("maps subjectType.type to the LMS names", () => {
    expect([0, "1", 2, 5, 6].map((t) => CLASS_KIND_LABEL[kindOfLessonType(t)])).toEqual(["Lecture", "Tutorial", "Laboratory", "Independent work", "Independent work"]);
    expect(kindOfLessonType(null, "Tutorial")).toBe("tutorial");
    expect(kindOfLessonType(undefined, "Mid Term Exam")).toBe("exam");
  });
});

import { dayOff } from "@/server/views/timetable";
describe("why a day has no classes", () => {
  it("names holidays and weekends, and leaves teaching days alone", () => {
    expect(dayOff("2026-11-08")).toBe("Weekend");
    expect(dayOff("2026-10-31")).toBeNull();
    expect(dayOff("2026-11-04")).toBeNull();
  });
});

import { sameRoom } from "@/server/sync/convert";
describe("room comparisons ignore the building format", () => {
  it("treats 306 and MATH 306 as one room, but not different rooms", () => {
    expect(sameRoom("306", "MATH 306")).toBe(true);
    expect(sameRoom("MATH 306", "MATH 306")).toBe(true);
    expect(sameRoom("306", "UCA 209")).toBe(false);
    expect(sameRoom("MATH 306", "UCA 306")).toBe(false);
  });
});
