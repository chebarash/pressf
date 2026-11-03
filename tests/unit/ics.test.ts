import { describe, expect, it } from "vitest";
import { foldLine, googleSubscribeUrl, icsCalendar, icsText } from "@/core/ics";

describe("ics writer", () => {
  const now = new Date("2026-11-02T05:30:00Z");

  it("writes timed events in UTC and all-day events with an exclusive end", () => {
    const ics = icsCalendar({
      name: "Press F · Ali", now,
      events: [
        { uid: "a@x", summary: "Calculus 1 · Lecture", location: "MATH 306", start: new Date("2026-11-02T10:00:00+05:00"), end: new Date("2026-11-02T11:20:00+05:00") },
        { uid: "b@x", summary: "Final exams", day: "2027-01-11", endDay: "2027-01-15" },
      ],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("X-WR-TIMEZONE:Asia/Tashkent\r\n");
    expect(ics).toContain("DTSTART:20261102T050000Z\r\nDTEND:20261102T062000Z\r\n");
    expect(ics).toContain("LOCATION:MATH 306\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270111\r\nDTEND;VALUE=DATE:20270116\r\n");
    expect(ics).toContain("DTSTAMP:20261102T053000Z\r\n");
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("escapes text and folds long lines without splitting characters", () => {
    expect(icsText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
    const long = `SUMMARY:${"Ölçü ".repeat(40)}`;
    const folded = foldLine(long);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(lines.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });

  it("links Google's add-by-URL page to the webcal feed", () => {
    expect(googleSubscribeUrl("https://pressf.chebarash.uz/calendar/feed/abc.ics")).toBe(
      "https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fpressf.chebarash.uz%2Fcalendar%2Ffeed%2Fabc.ics",
    );
  });
});
