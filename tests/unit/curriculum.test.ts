import { describe, expect, it } from "vitest";
import { liveSemesters, mergeRecords, runningNow } from "@/lib/curriculum";

const course = (code: string, type: "core" | "elective" = "core") => ({ code, subject: code, credits: 6, type, elective_group: null, prerequisites: null });
const plan = { program: "p", source_url: null, academic_year: null, semesters: [
  { number: 1, year: 1, term: "fall" as const, courses: [course("MATH111"), course("CS100"), course("CS900", "elective")] },
  { number: 2, year: 1, term: "spring" as const, courses: [course("PHYS101"), course("CS200")] },
] };
const lesson = (cls: string, code: string, subject = code) => ({ class: cls, code, subject, day: 0, starts: "10:00", ends: "11:00", teacher: null, teacher_name: null, room: null });
const groups = [{ class: "A1", program: "p", year: 1 }, { class: "A2", program: "p", year: 1 }, { class: "B1", program: "other", year: 1 }];

describe("liveSemesters", () => {
  const live = (timetable: ReturnType<typeof lesson>[], term = "fall", source: typeof plan | null = plan) => liveSemesters(source ?? undefined, runningNow("p", { groups, timetable }, term));

  it("adds what runs and keeps the planned credits", () => {
    const [fall] = live([lesson("A1", "MATH111"), lesson("A2", "ECON101", "Economics")]);
    expect(fall.live).toBe(true);
    expect(fall.courses.find((c) => c.code === "MATH111")).toMatchObject({ credits: 6 });
    expect(fall.courses.find((c) => c.code === "ECON101")).toMatchObject({ subject: "Economics", credits: null });
  });
  it("marks required courses that do not run, not electives", () => {
    const [fall] = live([lesson("A1", "MATH111")]);
    expect(fall.courses.find((c) => c.code === "CS100")?.notRunning).toBe(true);
    expect(fall.courses.find((c) => c.code === "CS900")?.notRunning).toBeUndefined();
  });
  it("moves a course out of the semester it was planned for", () => {
    const [fall, spring] = live([lesson("A1", "PHYS101")]);
    expect(fall.courses.map((c) => c.code)).toContain("PHYS101");
    expect(spring.courses.map((c) => c.code)).toEqual(["CS200"]);
  });
  it("ignores placeholders and other programs", () => {
    const [fall] = live([lesson("A1", "E"), lesson("A1", "MATH111"), lesson("B1", "ART100")]);
    expect(fall.courses.map((c) => c.code)).not.toContain("E");
    expect(fall.courses.map((c) => c.code)).not.toContain("ART100");
  });
  it("builds a semester for a program with no plan", () => {
    expect(live([lesson("A1", "MD101")], "fall", null)).toMatchObject([{ number: 1, year: 1, term: "fall", live: true }]);
  });
  it("leaves the plan alone in summer and with an empty timetable", () => {
    expect(live([lesson("A1", "X100")], "summer")[0].live).toBeUndefined();
    expect(live([])[0].live).toBeUndefined();
  });
  it("keeps a finished term when the next one starts", () => {
    const fall = runningNow("p", { groups, timetable: [lesson("A1", "ECON101", "Economics")] }, "fall");
    const spring = runningNow("p", { groups, timetable: [lesson("A1", "CS200")] }, "spring");
    const [first, second] = liveSemesters(plan, mergeRecords(fall, spring));
    expect(first.courses.map((c) => c.code)).toContain("ECON101");
    expect(first.live).toBe(true);
    expect(second.live).toBe(true);
  });
  it("lets this term's timetable win over its stored copy", () => {
    const old = [{ year: 1, term: "fall", courses: [{ code: "OLD100", subject: "Old" }] }];
    const fresh = [{ year: 1, term: "fall", courses: [{ code: "NEW100", subject: "New" }] }];
    expect(mergeRecords(old, fresh)).toEqual(fresh);
  });
});
