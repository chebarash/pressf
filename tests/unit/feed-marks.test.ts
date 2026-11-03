import { describe, expect, it } from "vitest";
import { attendanceMark, gradeMark, lessonLabel, markTier, scoreText } from "@/core/feed-marks";

describe("grade items read back from their ids (old rows too)", () => {
  it("a class mark: what was graded, the score, no maximum, a tier", () => {
    expect(gradeMark({ id: "grade:101:ev:1793595600:Midterm:87", kind: "grade" })).toEqual({ what: "Midterm", score: 87, max: null, tier: "high" });
    expect(gradeMark({ id: "grade:102:ev::Quiz 5:7", kind: "grade" })).toEqual({ what: "Quiz 5", score: 7, max: null, tier: "mid" });
    expect(gradeMark({ id: "grade:102:ev:1:Lab: part 2:3", kind: "grade" })?.what).toBe("Lab: part 2");
  });
  it("a final: out of 100", () => {
    const g = gradeMark({ id: "grade:90:final:58", kind: "grade" })!;
    expect(g).toEqual({ what: "Final grade", score: 58, max: 100, tier: "low" });
    expect(scoreText(g)).toBe("58 / 100");
  });
  it("other kinds and odd ids give nothing", () => {
    expect(gradeMark({ id: "grade:101:final:x", kind: "grade" })).toBeNull();
    expect(gradeMark({ id: "absence:101:Lecture 1", kind: "absence" })).toBeNull();
  });
  it("tiers on the app's scale", () => {
    expect([markTier(90, 100), markTier(70, 100), markTier(40, 100), markTier(9, null), markTier(66, null)]).toEqual(["high", "mid", "low", "high", "mid"]);
    expect(lessonLabel("Lecture  № 7")).toBe("Lecture 7");
  });
});

describe("attendance items", () => {
  const course = {
    subjectId: "101",
    admit: { absence_count_all: 9, avaibale_count_all: 6, lessons_count: 60 },
    events: [
      { lesson_name: "Lecture № 14", status: 3, at: String(Date.parse("2026-11-02T08:30:00Z") / 1000) },
      { lesson_name: "Practice № 9", status: 2, at: String(Date.parse("2026-11-03T07:00:00Z") / 1000) },
    ],
  };

  it("with the gradebook: class time, the mark as it stands, absences left now", () => {
    expect(attendanceMark({ id: "absence:101:Lecture № 14", kind: "absence", title: "Marked absent · 7 left" }, course)).toEqual({
      kind: "mark", lesson: "Lecture 14", when: "Mon 2 Nov 13:30", mark: "absent", left: 6, limit: 15, missed: 9, status: "ok", line: "6 absences left", tone: "ok",
    });
    expect(attendanceMark({ id: "absence:101:Practice № 9", kind: "absence" }, course)?.mark).toBe("late");
  });

  it("an old row alone: the date from the body, the count from the title", () => {
    expect(attendanceMark({ id: "absence:102:Practice 14", kind: "absence", title: "Marked absent · 2 left", body: "Physics 1 · Practice 14 · Thu 29 Oct" })).toMatchObject({
      lesson: "Practice 14", when: "Thu 29 Oct", mark: "absent", left: 2, status: "low", line: "2 absences left", tone: "warn",
    });
    expect(attendanceMark({ id: "absence:102:Practice 14", kind: "absence", title: "Marked absent", body: "Physics 1 · Practice 14" })).toMatchObject({ left: null, line: null, tone: "ok" });
  });

  it("the limit warning, and over the limit in rust", () => {
    expect(attendanceMark({ id: "absence-limit:102:2", kind: "absence", title: "Careful: 2 absences left", body: "Physics 1 · 13 of 15 used" })).toMatchObject({
      kind: "limit", left: 2, limit: 15, missed: 13, tone: "warn",
    });
    const over = { subjectId: "102", admit: { absence_count_all: 16, avaibale_count_all: -1, lessons_count: 60 }, events: [] };
    expect(attendanceMark({ id: "absence-limit:102:2", kind: "absence" }, over)).toMatchObject({ status: "over", line: "Over the absence limit", tone: "danger" });
  });
});
