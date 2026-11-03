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
