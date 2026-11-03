import { describe, expect, it } from "vitest";
import { audienceMatches, personOf } from "@/server/broadcasts";
import { overlay, overlayAll, sessionRevoked } from "@/server/decisions";
import { examCheck, lmsScore, nameSimilarity, personalData } from "@/server/upload-checks";

describe("sessionRevoked", () => {
  const at = new Date("2026-11-02T10:00:00Z");
  it("voids sessions issued before the sign-out, keeps later ones", () => {
    expect(sessionRevoked(at.getTime() - 1, at)).toBe(true);
    expect(sessionRevoked(undefined, at)).toBe(true);
    expect(sessionRevoked(at.getTime() + 1, at)).toBe(false);
    expect(sessionRevoked(0, null)).toBe(false);
  });
});

describe("file overrides", () => {
  const item = { id: "F1", source: "lms", title: "Slides", type: "lecture" as const, typeLabel: "Lecture", week: 3 };
  it("renames, retypes and moves; hides", () => {
    expect(overlay(item, { title: "New", type: "exam", week: 9, hidden: false })).toMatchObject({ title: "New", type: "exam", typeLabel: "Past exam", week: 9 });
    expect(overlay(item, { title: null, type: "bogus", week: null, hidden: false })).toEqual(item);
    expect(overlay(item, { title: null, type: null, week: null, hidden: true })).toBeNull();
  });
  it("leaves student uploads alone", () => {
    const up = { ...item, id: "u", source: "students" };
    expect(overlayAll([item, up], { F1: { title: null, type: null, week: null, hidden: true }, u: { title: null, type: null, week: null, hidden: true } })).toEqual([up]);
  });
});

describe("broadcast audience", () => {
  const p = personOf({ profile: { semesters: [{}, {}, {}] }, enrollment: { codes: ["MATH111"] } }, (t) => t === "Fall 2025");
  it("matches years, courses and haven't rated", () => {
    expect(p.year).toBe(2);
    expect(audienceMatches({}, p)).toBe(true);
    expect(audienceMatches({ years: [2] }, p)).toBe(true);
    expect(audienceMatches({ years: [1] }, p)).toBe(false);
    expect(audienceMatches({ courseIds: ["PHYS101"] }, p)).toBe(false);
    expect(audienceMatches({ unrated: "Fall 2025" }, p)).toBe(false);
    expect(audienceMatches({ unrated: "Spring 2026" }, p)).toBe(true);
  });
});

describe("upload checks (pure)", () => {
  it("scores LMS likeness by name and size", () => {
    expect(nameSimilarity("Week 8 Midterm review.pdf", "Midterm review (week 8).pptx")).toBe(1);
    expect(nameSimilarity("a.pdf", "")).toBe(0);
    expect(lmsScore({ name: "x.pdf", size: 10 }, { name: "y.pdf", size: 10 })).toBe(0.95);
    expect(lmsScore({ name: "lecture notes.pdf", size: 10 }, { name: "exam answers.pdf", size: 11 })).toBe(0);
  });
  it("finds phones, emails and student ids", () => {
    expect(personalData("Tel: +998 (90) 123-45-67")).toEqual(["phone numbers"]);
    expect(personalData("Student ID: 2210345, a.b@newuu.uz")).toEqual(["emails", "student IDs"]);
    expect(personalData("Integral of x from 0 to 1 = 0.5; page 12345")).toEqual([]);
  });
  it("only checks exams and mocks", () => {
    expect(examCheck({ type: "notes" }, new Date())).toBeUndefined();
    expect(examCheck({ type: "mock", exam: "final", term: "Fall 2026" }, new Date("2027-01-12T06:00:00Z"))).toMatchObject({ running: true });
    expect(examCheck({ type: "mock", exam: "final", term: "Fall 2026" }, new Date("2027-02-01T06:00:00Z"))).toMatchObject({ running: false });
  });
});
