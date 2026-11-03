import { describe, expect, it } from "vitest";
import { gradePoints, semesterGpa } from "@/core/grades";
import { planCourses } from "@/lib/lms/profile";

describe("semester GPA (NewUU 4.5 scale, as the transcript computes it)", () => {
  it("maps finals to grade points", () => {
    expect([100, 95, 94, 85, 84, 75, 74, 65, 64, 60, 59, 50, 49, 40, 39, 0].map(gradePoints)).toEqual([4.5, 4.5, 4, 4, 3.5, 3.5, 3, 3, 2.75, 2.75, 2.5, 2.5, 2, 2, 0, 0]);
    expect(gradePoints(null)).toBeNull();
  });

  it("weights by ECTS, counts failures and FX as 0, leaves passed pass/fail courses out", () => {
    // (4.5·6 + 3.5·6 + 2.75·6 + 2·8 + 0·6 + 0·6) / 38 = 80.5 / 38
    expect(semesterGpa([
      { final: 95, ects: 6 }, { final: 80, ects: 6 }, { final: 62, ects: 6 }, { final: 45, ects: 8 },
      { final: 0, ects: 6, passFail: true }, { final: 55, fx: true, ects: 6 },
      { final: 90, ects: 6, passFail: true }, { final: null, ects: 6 }, { final: 70, ects: null },
    ])).toBe(2.12);
    expect(semesterGpa([{ final: 40, ects: 6 }, { final: 41, ects: 8 }, { final: 85, ects: 6 }])).toBe(2.6);
    expect(semesterGpa([{ final: null, ects: 6 }])).toBeNull();
    expect(semesterGpa([{ final: 70, ects: 6, passFail: true }])).toBeNull();
  });

  it("reads ECTS and pass/fail from the individual education plan", () => {
    expect(planCourses([{ semester_id: "10", subjects: [{ subject_id: "89", ects: "6", rating_passed: "3" }, { subject_id: "15", ects: "6", rating_passed: "0" }, { subject_id: "16", ects: "" }] }])).toEqual({
      "89": { ects: 6, passFail: true },
      "15": { ects: 6, passFail: false },
      "16": { ects: null, passFail: false },
    });
    expect(planCourses(null)).toEqual({});
  });
});
