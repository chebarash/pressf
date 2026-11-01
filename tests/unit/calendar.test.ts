import { describe, expect, it } from "vitest";
import { calendarHint, currentWeek, milestones, upcoming, weeks } from "@/lib/calendar";

const at = (date: string) => new Date(`${date}T10:00:00Z`);

describe("calendar data", () => {
  it("has every week of the year in order", () => {
    expect(weeks).toHaveLength(51);
    for (let i = 1; i < weeks.length; i++) expect(weeks[i].starts > weeks[i - 1].starts).toBe(true);
  });
  it("lists exams, breaks and registration", () => {
    expect(milestones.map((m) => m.kind)).toEqual(expect.arrayContaining(["midterm", "final", "break", "registration", "resit_exam"]));
  });
});

describe("currentWeek", () => {
  it("counts from Week 1 after induction, not from the semester start", () => {
    expect(currentWeek(at("2026-09-08"))?.kind).toBe("induction");
    expect(currentWeek(at("2026-09-15"))?.week).toBe(1);
  });
  it("keeps the finished week over the weekend", () => {
    expect(currentWeek(at("2026-11-01"))?.week).toBe(7);
  });
  it("knows exam weeks and breaks", () => {
    expect(currentWeek(at("2026-11-03"))?.kind).toBe("midterm");
    expect(currentWeek(at("2026-12-23"))?.kind).toBe("break");
    expect(currentWeek(at("2027-01-05"))?.week).toBe(15);
  });
  it("is empty outside the year", () => expect(currentWeek(at("2030-01-01"))).toBeNull());
});

describe("upcoming", () => {
  it("finds an event inside the window only", () => {
    expect(upcoming("midterm", 7, at("2026-11-01"))?.starts).toBe("2026-11-02");
    expect(upcoming("midterm", 7, at("2026-10-01"))).toBeNull();
  });
});

describe("calendarHint", () => {
  it("warns before and during exams", () => {
    expect(calendarHint(at("2026-11-01"))?.text).toMatch(/Midterm week starts 2 Nov/);
    expect(calendarHint(at("2026-11-03"))?.text).toMatch(/Midterm exams are on/);
    expect(calendarHint(at("2027-01-06"))?.text).toMatch(/Final exams start/);
  });
  it("points to next semester late in the term and before registration", () => {
    expect(calendarHint(at("2026-12-08"))?.href).toBe("/next-semester");
    expect(calendarHint(at("2027-02-10"))?.text).toMatch(/registration opens 15 Feb/);
    expect(calendarHint(at("2027-02-16"))?.text).toBe("Course registration is open.");
  });
  it("mentions resit registration", () => expect(calendarHint(at("2027-01-20"))?.text).toMatch(/Resit registration/));
  it("stays quiet in ordinary weeks", () => expect(calendarHint(at("2026-10-06"))).toBeNull());
});

describe("exam links", () => {
  it("opens the right kind of paper", () => {
    expect(calendarHint(at("2026-11-01"))?.href).toBe("/files?type=midterm");
    expect(calendarHint(at("2027-01-06"))?.href).toBe("/files?type=final");
  });
  it("narrows to the group's courses when it is known", () => expect(calendarHint(at("2026-11-03"), true)?.href).toBe("/files?type=midterm&mine=1"));
});

