import { describe, expect, it } from "vitest";
import { milestoneKind, milestoneLine, readTiming, singular, syllabusMilestones, termWeeks, weightLabel, type MilestoneClass, type MilestoneSyllabus } from "@/core/milestones";
import { WEEKS } from "@/core/semester";
import { addDays } from "@/core/time";

const FALL = termWeeks("2026-11-11");

/** Deep Learning: lecture Monday 10:00, lab Wednesday 14:00, tutorial Friday 09:00, every class week of Fall 2026. */
function timetable(code = "CS412"): MilestoneClass[] {
  const out: MilestoneClass[] = [];
  for (const w of FALL.filter((x) => x.kind === "teaching")) {
    for (const [offset, kind, time] of [[0, "lecture", "10:00"], [2, "lab", "14:00"], [4, "tutorial", "09:00"]] as const) {
      const day = addDays(w.starts, offset);
      out.push({ key: `${code}:${day}:${kind}`, code, kind, day, start: `${day}T${time}:00+05:00` });
    }
  }
  // The university sheet's midterm and final.
  out.push({ key: `${code}:exam:mid`, code, kind: "exam", day: "2026-11-04", start: "2026-11-04T09:00:00+05:00" });
  out.push({ key: `${code}:exam:final`, code, kind: "exam", day: "2027-01-13", start: "2027-01-13T13:00:00+05:00" });
  return out;
}

const syllabus = (assessment: MilestoneSyllabus["assessment"], topics: MilestoneSyllabus["topics_by_week"] = []): MilestoneSyllabus => ({ course_code: "CS412", assessment, topics_by_week: topics });
const one = (timing: string, name = "Quiz", weight: number | null = 10) => syllabusMilestones(syllabus([{ name, weight_percent: weight, timing }]), timetable(), FALL);

describe("reading the timing a syllabus gives", () => {
  it("reads the shapes syllabi use", () => {
    expect(readTiming("Week 5")).toEqual([{ week: 5, weekday: undefined }]);
    expect(readTiming("Weeks 6–7")).toEqual([{ range: [6, 7] }]);
    expect(readTiming("Week 8 (midterm week)")).toEqual([{ week: 8, weekday: undefined }]);
    expect(readTiming("in-class quiz every Friday")).toEqual([{ every: true, weekday: 5 }]);
    expect(readTiming("Quiz 1 – Week 4; Quiz 2 – Week 9")).toEqual([{ label: "Quiz 1", week: 4, weekday: undefined }, { label: "Quiz 2", week: 9, weekday: undefined }]);
    expect(readTiming("During lab sessions")).toEqual([{ every: true, weekday: undefined }]);
    expect(readTiming("Final exam period")).toEqual([{ period: "final" }]);
    expect(readTiming("Weeks 4, 8 and 12")).toEqual([4, 8, 12].map((week) => ({ week, weekday: undefined })));
    expect(readTiming("Due 14 December 2026")).toEqual([{ date: { y: 2026, m: 12, d: 14 } }]);
    expect(readTiming("March 15")).toEqual([{ date: { y: null, m: 3, d: 15 } }]);
    expect(readTiming("2026-11-20")).toEqual([{ date: { y: 2026, m: 11, d: 20 } }]);
    expect(readTiming("20.11.2026")).toEqual([{ date: { y: 2026, m: 11, d: 20 } }]);
  });

  it("finds nothing where the syllabus says nothing placeable", () => {
    for (const t of ["", "TBA", "TBD", "Throughout the semester", "Ongoing", "Weeks 1-15", "Continuous assessment", "As announced by the instructor", "Week 5/6 of the project"]) {
      expect(readTiming(t).filter((s) => !s.week), t).toEqual([]);
    }
  });

  it("names kinds the way students do", () => {
    expect(["Quiz", "Quizzes", "Short tests", "Final project", "Group presentation", "Midterm Exam", "Mid-term", "Final Exam", "Lab reports", "Homework assignments", "Participation"].map(milestoneKind))
      .toEqual(["quiz", "quiz", "quiz", "project", "presentation", "midterm", "midterm", "final", "lab-report", "assignment", "other"]);
    expect(singular("Quizzes")).toBe("Quiz");
    expect(singular("Assignments")).toBe("Assignment");
  });
});

describe("placing milestones on the student's classes", () => {
  it("a Week 5 quiz lands on the first class of teaching week 5, inferred", () => {
    const [m] = one("Week 5");
    expect(m).toMatchObject({ courseCode: "CS412", kind: "quiz", title: "Quiz", weight: 10, of: 1, day: "2026-10-12", classKey: "CS412:2026-10-12:lecture", certainty: "inferred", source: "Week 5" });
    expect(milestoneLine(m)).toBe("Quiz · 10% · from the syllabus (likely this lesson)");
  });

  it("a named session type goes on that session", () => {
    expect(one("Week 5, in the lab")[0]).toMatchObject({ day: "2026-10-14", classKey: "CS412:2026-10-14:lab" });
    expect(one("Week 6 tutorial")[0]).toMatchObject({ day: "2026-10-23", classKey: "CS412:2026-10-23:tutorial" });
  });

  it("a weekday is stated: every Friday lands on each Friday class", () => {
    const list = one("in-class quiz every Friday", "In-class quizzes", 15);
    expect(list.length).toBe(FALL.filter((w) => w.kind === "teaching").length);
    expect(list.every((m) => m.certainty === "stated" && m.classKey?.endsWith(":tutorial") && m.of === null)).toBe(true);
    expect(list[0]).toMatchObject({ title: "In-class quiz", day: "2026-09-18" });
    expect(weightLabel(list[0])).toBe("15% in total");
  });

  it("labelled items keep their labels and share the weight", () => {
    const list = syllabusMilestones(syllabus([{ name: "Quizzes", weight_percent: 20, timing: "Quiz 1 – Week 4; Quiz 2 – Week 9" }]), timetable(), FALL);
    expect(list.map((m) => [m.title, m.day, m.of])).toEqual([["Quiz 1", "2026-10-05", 2], ["Quiz 2", "2026-11-09", 2]]);
    expect(weightLabel(list[1])).toBe("20% for all 2");
  });

  it("weeks 4, 8 and 12 become three numbered items", () => {
    expect(syllabusMilestones(syllabus([{ name: "Quizzes", weight_percent: 30, timing: "Weeks 4, 8 and 12" }]), timetable(), FALL).map((m) => m.title)).toEqual(["Quiz 1", "Quiz 2", "Quiz 3"]);
  });

  it("the midterm in week 8 goes on the exam from the university sheet", () => {
    expect(one("Week 8 (midterm week)", "Midterm Exam", 30)[0]).toMatchObject({ kind: "midterm", classKey: "CS412:exam:mid", day: "2026-11-04", certainty: "stated" });
  });

  it("the final exam period goes on the final, and is not placed without one", () => {
    expect(one("Final exam period", "Final Exam", 40)[0]).toMatchObject({ kind: "final", classKey: "CS412:exam:final", day: "2027-01-13" });
    expect(syllabusMilestones(syllabus([{ name: "Final Exam", weight_percent: 40, timing: "Final exam period" }]), timetable().filter((c) => c.kind !== "exam"), FALL)).toEqual([]);
  });

  it("during lab sessions: each lab, inferred", () => {
    const list = one("During lab sessions", "Lab reports", 20);
    expect(list.length).toBeGreaterThan(10);
    expect(list.every((m) => m.classKey?.endsWith(":lab") && m.certainty === "inferred" && m.kind === "lab-report")).toBe(true);
  });

  it("a week span or a week without a class is an all-day item without a class", () => {
    expect(one("Weeks 6–7", "Group presentations", 15)[0]).toMatchObject({ kind: "presentation", day: "2026-10-19", endDay: "2026-10-30", classKey: null, certainty: "inferred" });
    const none = syllabusMilestones(syllabus([{ name: "Project", weight_percent: 25, timing: "Week 12" }]), [], FALL);
    expect(none[0]).toMatchObject({ kind: "project", day: "2026-11-30", endDay: "2026-12-04", classKey: null });
    expect(milestoneLine(none[0])).toBe("Project · 25% · from the syllabus (likely this week)");
  });

  it("a real date is stated, on the class that day if there is one", () => {
    expect(one("Due 16 November 2026", "Assignment 2", 10)[0]).toMatchObject({ day: "2026-11-16", classKey: "CS412:2026-11-16:lecture", certainty: "stated" });
    expect(one("November 17", "Essay", 10)[0]).toMatchObject({ day: "2026-11-17", classKey: null, certainty: "stated" });
    expect(milestoneLine(one("November 17", "Essay", 10)[0])).toBe("Essay · 10% · from the syllabus");
  });

  it("never invents: another year's date, no timing, unknown weeks", () => {
    expect(one("Due 16 November 2024")).toEqual([]);
    expect(one("March 15")).toEqual([]);
    expect(one("TBA")).toEqual([]);
    expect(one("Week 19")).toEqual([]);
    expect(one("Throughout the semester", "Participation", 10)).toEqual([]);
  });

  it("reads the weekly plan too, without doubling the assessment table", () => {
    const list = syllabusMilestones(
      syllabus([{ name: "Quizzes", weight_percent: 10, timing: "" }, { name: "Midterm Exam", weight_percent: 30, timing: "Week 8" }], [
        { week: "Week 4", topic: "Backpropagation. Quiz 1" },
        { week: "9", topic: "CNNs; Quiz #2" },
        { week: "8", topic: "Midterm exam" },
        { week: "10", topic: "Hypothesis testing and data presentation" },
      ]),
      timetable(),
      FALL,
    );
    expect(list.map((m) => [m.title, m.day, m.weight, m.of])).toEqual([["Quiz 1", "2026-10-05", 10, 2], ["Midterm Exam", "2026-11-04", 30, 1], ["Quiz 2", "2026-11-09", 10, 2]]);
    expect(list[0].source).toBe("Week 4: Backpropagation. Quiz 1");
  });

  it("the term's weeks come from the published calendar", () => {
    expect(FALL.every((w) => w.term === "fall")).toBe(true);
    expect(termWeeks("2027-03-01", WEEKS).every((w) => w.term === "spring")).toBe(true);
  });
});
