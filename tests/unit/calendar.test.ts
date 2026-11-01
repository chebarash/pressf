import { describe, expect, it } from "vitest";
import { activeTerm, calendarHint, calendarIcs, countdowns, currentWeek, daysUntil, holidaysIn, milestones, semesterProgress, tashkentNow, upcoming, weekTitle, weeks } from "@/lib/calendar";

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

describe("calendar page data", () => {
  it("tells where the semester is", () => {
    expect(semesterProgress(at("2026-10-28"))).toEqual({ term: "fall", week: 7, total: 16 });
    expect(semesterProgress(at("2026-12-25"))).toBeNull();
  });
  it("opens the term that is running or comes next", () => {
    expect(activeTerm(at("2027-03-01"))).toBe("spring");
    expect(activeTerm(at("2027-07-20"))).toBe("summer");
  });
  it("counts days from the given date", () => {
    expect(daysUntil("2026-11-02", at("2026-11-01"))).toBe(1);
    expect(daysUntil("2026-10-30", at("2026-11-01"))).toBe(-2);
  });
  it("finds the next exams, day off and registration", () => {
    const [exams, off, register] = countdowns(at("2026-11-01"));
    expect(exams.event).toMatchObject({ title: "Midterm exams", starts: "2026-11-02", href: "/files?type=midterm" });
    expect(off.event).toMatchObject({ title: "Constitution Day", starts: "2026-12-08" });
    expect(register.event).toMatchObject({ starts: "2027-02-15" });
  });
  it("treats the two week break as one stretch", () => {
    expect(countdowns(at("2026-12-10"))[1].event).toMatchObject({ starts: "2026-12-21", ends: "2027-01-01" });
  });
  it("keeps counting through an exam week", () => {
    expect(countdowns(at("2026-11-04"))[0].event?.starts).toBe("2026-11-02");
  });
  it("names every week", () => {
    expect(weeks.every((week) => weekTitle(week).length > 0)).toBe(true);
    expect(weekTitle(weeks[18])).toBe("Online revision week");
    expect(weekTitle(weeks[47])).toBe("Summer midterm exam");
  });
  it("places holidays in their weeks", () => {
    expect(holidaysIn(weeks[27]).map((h) => h.name)).toEqual(["International Women's Day"]);
  });
  it("uses Tashkent dates near midnight", () => {
    expect(tashkentNow(new Date("2026-11-01T20:00:00Z")).toISOString().slice(0, 10)).toBe("2026-11-02");
  });
  it("exports all day events that end on the last day", () => {
    const ics = calendarIcs();
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("SUMMARY:Midterm exams");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261107");
    expect(ics).toContain("SUMMARY:Teachers' Day");
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(milestones.length + 4);
  });
});
