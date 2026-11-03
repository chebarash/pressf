import { describe, expect, it } from "vitest";
import { weekOverlays } from "@/screens/desktop/adapt";
import type { CalendarEvent } from "@/server/views";
import { comingUp, monthsShown, weekOverlays as weekEvents } from "@/server/views/schedule";

const ev = (e: Partial<CalendarEvent> & Pick<CalendarEvent, "key" | "layer" | "day">): CalendarEvent => ({ title: e.key, sub: "", endDay: e.day, time: null, href: null, ...e });
const DAYS = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];

describe("Timetable week overlays", () => {
  it("puts deadlines inside the hours shown at their time and the rest under the day heads", () => {
    const o = weekOverlays(
      [
        ev({ key: "deadline:1", layer: "deadlines", day: "2026-11-04", time: "17:00", title: "Quiz 6" }),
        ev({ key: "deadline:2", layer: "deadlines", day: "2026-11-03", time: "23:59", title: "Lab report" }),
        ev({ key: "phase:midterm", layer: "exams", day: "2026-10-31", endDay: "2026-11-08", title: "Midterm exams" }),
        ev({ key: "holiday:x", layer: "holidays", day: "2026-11-08", title: "Sunday holiday" }),
      ],
      DAYS,
      { start: 9, end: 20 },
    );
    expect(o.markers).toEqual([{ key: "deadline:1", title: "Quiz 6 · 17:00", day: 2, minutes: 1020, href: null }]);
    expect(o.lanes).toEqual([
      { key: "phase:midterm", title: "Midterm exams", kind: "exam", href: null, from: 0, to: 4, lane: 0 },
      { key: "deadline:2", title: "Lab report · 23:59", kind: "deadline", href: null, from: 1, to: 1, lane: 1 },
    ]);
  });

  it("leaves out what the grid shows and what is outside the week", () => {
    const week = { week: DAYS.map((day) => ({ day, label: "", date: "", selected: false, today: false, classes: 0, off: day === "2026-11-05" ? "Holiday · Constitution Day" : null })) };
    const events = [
      ev({ key: "class:a", layer: "exams", day: "2026-11-04", title: "Calculus 1 exam" }),
      ev({ key: "holiday:2026-11-05", layer: "holidays", day: "2026-11-05", title: "Constitution Day" }),
      ev({ key: "deadline:1", layer: "deadlines", day: "2026-11-04" }),
      ev({ key: "deadline:1", layer: "deadlines", day: "2026-11-04" }),
      ev({ key: "deadline:2", layer: "deadlines", day: "2026-11-12" }),
    ];
    expect(weekEvents(events, week as never).map((e) => e.key)).toEqual(["deadline:1"]);
  });

  it("lists what is coming up once, a running phase first", () => {
    const list = comingUp(
      [
        ev({ key: "phase:reg", layer: "registration", day: "2026-10-20", endDay: "2026-11-20" }),
        ev({ key: "deadline:1", layer: "deadlines", day: "2026-11-04" }),
        ev({ key: "deadline:1", layer: "deadlines", day: "2026-11-04" }),
        ev({ key: "deadline:old", layer: "deadlines", day: "2026-10-30" }),
      ],
      "2026-11-02",
    );
    expect(list.map((e) => e.key)).toEqual(["phase:reg", "deadline:1"]);
  });

  it("shows five months from this one, reaching to the asked month", () => {
    expect(monthsShown("2026-11-02", "2026-11-20")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
    expect(monthsShown("2026-11-02", "2027-06-01")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06"]);
    expect(monthsShown("2026-11-02", "2026-09-10")[0]).toBe("2026-09");
  });
});
