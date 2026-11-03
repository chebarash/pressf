import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => ({ scheduleRefresh: vi.fn() }));
vi.mock("@/server/sync/refresh", () => refresh);

import { saveFeedLayers } from "@/server/calendar-feed";
import * as adapt from "@/screens/desktop/adapt";
import * as views from "@/server/views";
import { resetDb } from "../fixtures/db";
import { NOW, seedStudent } from "../fixtures/student";

/** Timetable's week and month (Calendar merged into Timetable): one view model; the site shows everything. */

let userId: string;

beforeEach(async () => {
  await resetDb();
  refresh.scheduleRefresh.mockReset();
  userId = await seedStudent();
});

describe("timetable week with the calendar over it", () => {
  it("lays the week's deadlines and exam weeks over the grid, and lists what is coming up", async () => {
    const s = (await views.schedule(userId, { view: "week", day: "2026-11-02" }, NOW))!;
    expect(s.view).toBe("week");
    expect(s.week?.weekClasses?.length).toBeGreaterThan(0);
    expect(s.overlays.find((e) => e.layer === "deadlines")).toMatchObject({ title: "Lab 6 report", day: "2026-11-04", time: "23:59" });
    expect(s.overlays.some((e) => e.layer === "exams" && e.endDay > e.day)).toBe(true);
    expect(s.coming.length).toBeGreaterThan(0);
    expect(s.coming.every((e) => e.endDay >= "2026-11-02")).toBe(true);

    const d = adapt.schedule(s, NOW);
    if (d.view !== "week") throw new Error("week expected");
    // 23:59 is past the hours shown: an all-day bar on Wednesday, not a line.
    expect(d.data.overlays!.lanes.find((l) => l.kind === "deadline")).toMatchObject({ title: "Lab 6 report · 23:59", from: 2, to: 2 });
    expect(d.data.overlays!.markers).toEqual([]);
    // Today's week needs no ?day=.
    expect(d.data.nav!.views).toEqual([
      { label: "Week", href: "/timetable", active: true },
      { label: "Month", href: "/timetable?view=month", active: false },
    ]);
    // Nothing is picked until a class is clicked: the panel shows "Coming up" and the student's own feed.
    expect(d.data.selected).toBeNull();
    expect(d.data.nav!.subscribe.personal).toBe(true);
    expect(d.data.nav!.subscribe.google).toMatch(/calendar\.google\.com.*calendar%2Ffeed%2F/);
  });

  it("never repeats what the grid shows: no classes, no exam classes, each event once", async () => {
    const s = (await views.schedule(userId, { view: "week", day: "2026-11-02" }, NOW))!;
    expect(s.overlays.filter((e) => e.layer === "classes" || e.key.startsWith("class:"))).toEqual([]);
    const keys = s.overlays.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    const coming = s.coming.map((e) => e.key);
    expect(new Set(coming).size).toBe(coming.length);
  });

  it("shows everything whatever the Google Calendar feed carries", async () => {
    await saveFeedLayers(userId, ["holidays"]);
    const s = (await views.schedule(userId, { view: "week", day: "2026-11-02" }, NOW))!;
    expect(s.overlays.some((e) => e.layer === "deadlines")).toBe(true);
    expect(s.week!.classes.length).toBeGreaterThan(0);
    // The feed's own settings ride along for "In Google Calendar".
    expect(s.feed!.layers.filter((l) => l.on).map((l) => l.id)).toEqual(["holidays"]);
  });

  it("switches to the month at the week's day", async () => {
    const s = (await views.schedule(userId, { view: "week", day: "2026-11-18" }, NOW))!;
    const d = adapt.schedule(s, NOW);
    expect(d.view === "week" && d.data.nav!.views[1]).toEqual({ label: "Month", href: "/timetable?view=month&day=2026-11-18", active: false });
  });

  it("asks guests to sign in for the week", async () => {
    expect(await views.schedule(null, { view: "week" }, NOW)).toBeNull();
  });
});

describe("timetable month", () => {
  it("counts classes per day as dots and keeps exams, deadlines and holidays on the month", async () => {
    const s = (await views.schedule(userId, { view: "month" }, NOW))!;
    expect(s.months[0]).toBe("2026-11");
    expect(s.classDays["2026-11-02"]?.length).toBeGreaterThan(0);
    const events = s.calendar.days.flatMap((d) => d.events);
    expect(events.some((e) => e.layer === "classes")).toBe(false);
    expect(events.find((e) => e.layer === "deadlines")).toMatchObject({ title: "Lab 6 report" });
    expect(events.some((e) => e.layer === "holidays")).toBe(true);

    const d = adapt.schedule(s, NOW);
    if (d.view !== "month") throw new Error("month expected");
    const cell = d.data.months[0].weeks.flat().find((c) => c.key === "2026-11-02")!;
    expect(cell.classes!.length).toBe(s.classDays["2026-11-02"].length);
    // A day opens its week.
    expect(cell.href).toBe("/timetable?day=2026-11-02");
    expect(d.data.nav.views.find((v) => v.active)?.label).toBe("Month");
    expect(d.data.nav.feed?.every((l) => l.on)).toBe(true);
  });

  it("opens at the asked day's month, even a past one", async () => {
    const s = (await views.schedule(userId, { view: "month", day: "2026-09-15" }, NOW))!;
    expect(s.months[0]).toBe("2026-09");
    expect(s.months).toContain("2026-11");
    const d = adapt.schedule(s, NOW);
    if (d.view !== "month") throw new Error("month expected");
    expect(d.data.months[d.data.start!].label).toBe("September 2026");
  });

  it("shows guests the academic calendar with its public feed, no settings", async () => {
    const s = (await views.schedule(null, { view: "month" }, NOW))!;
    expect(s.week).toBeNull();
    expect(s.feed).toBeNull();
    expect(s.calendar.subscribe.personal).toBe(false);
    expect(s.calendar.days.flatMap((d) => d.events).some((e) => e.layer === "holidays")).toBe(true);
  });
});

describe("no layer chips on the site", () => {
  it("has no chips in either view and ignores ?layers=", () => {
    for (const file of ["src/screens/desktop/split/TimetableScreen.tsx", "src/screens/desktop/split/CalendarScreen.tsx", "src/screens/mobile/Calendar.tsx", "src/screens/mobile/Timetable.tsx"]) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/LayerChips|toggleLayerHref|filters/);
    }
    expect(readFileSync("src/app/(app)/timetable/page.tsx", "utf8")).not.toMatch(/q\.layers|parseLayers/);
  });
});
