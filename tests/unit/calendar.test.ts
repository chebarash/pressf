import { describe, expect, it } from "vitest";
import { calendarIcs } from "@/lib/calendar";

describe("calendar.ics", () => {
  it("exports all day events that end on the last day", () => {
    const ics = calendarIcs();
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("SUMMARY:Midterm exams");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261107");
    expect(ics).toContain("SUMMARY:Teachers' Day");
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBeGreaterThan(10);
  });
});

describe("exam weeks in the timetable", () => {
  it("run through Saturday, like the exam window", async () => {
    const { academicEvents } = await import("@/server/views/calendar");
    const events = await academicEvents(new Set(["exams"]), "2026-11-01", "2026-11-10");
    const midterm = events.find((e) => e.key.startsWith("phase:midterm"));
    expect(midterm).toMatchObject({ day: "2026-11-02", endDay: "2026-11-07" });
  });
});
