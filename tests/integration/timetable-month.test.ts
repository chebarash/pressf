import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => ({ scheduleRefresh: vi.fn() }));
vi.mock("@/server/sync/refresh", () => refresh);
const user = vi.hoisted(() => ({ current: null as null | { id: string; email: string; isAdmin: boolean } }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  getUser: async () => user.current,
}));

import { GET as weeksRoute } from "@/app/api/timetable/route";
import { db } from "@/lib/db";
import { syllabi } from "@/lib/db/schema";
import { saveFeedLayers } from "@/server/calendar-feed";
import { between, monthLayout, weekLayout } from "@/screens/shared/schedule/model";
import { lessonPanel } from "@/screens/shared/schedule/lesson";
import * as views from "@/server/views";
import { openingWeeks, scheduleWeeks } from "@/server/views/schedule";
import { syllabus } from "../fixtures/catalog";
import { resetDb } from "../fixtures/db";
import { NOW, seedStudent, snapshot, unix } from "../fixtures/student";

/** Timetable: one set of weeks for both views, loaded as they scroll in, each class with the facts of that dated lesson. */

let userId: string;

beforeEach(async () => {
  await resetDb();
  refresh.scheduleRefresh.mockReset();
  userId = await seedStudent({
    snapshot: snapshot({
      courses: [
        ...snapshot().courses.map((c) =>
          c.subjectId === "101"
            ? {
                ...c,
                events: [
                  { lesson_id: "L15", lesson_name: "Lecture 15", lesson_type: 0, status: 2, at: Number(unix("2026-11-02T10:00:00+05:00")), time: unix("2026-11-02T10:20:00+05:00"), mark: 8 },
                  { lesson_name: "Lecture 14", lesson_type: 0, status: 3, at: Number(unix("2026-10-28T10:00:00+05:00")), time: unix("2026-10-28T12:00:00+05:00") },
                ],
              }
            : c,
        ),
      ],
    }),
  });
  await db().insert(syllabi).values({ courseCode: "MATH111", sourceName: "calc.pdf", data: syllabus({ topics_by_week: [{ week: "8", topic: "Derivatives" }, { week: "7", topic: "Limits" }] }), matched: true });
  user.current = { id: userId, email: "s@newuu.uz", isAdmin: false };
});

const classesOf = (w: views.ScheduleWeek[]) => w.flatMap((x) => x.days).flatMap((d) => d.classes);

describe("the week loader", () => {
  it("returns the asked weeks from their Monday, Monday to Sunday, with the calendar over them", async () => {
    const [w] = await scheduleWeeks(userId, "2026-11-04", 1, NOW);
    expect(w.monday).toBe("2026-11-02");
    expect(w.days.map((d) => d.day)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(w.days[6].off).toBe("Weekend");
    expect(w.days[0].classes.map((c) => c.name)).toEqual(["Calculus 1"]);
    expect(w.events.find((e) => e.layer === "deadlines")).toMatchObject({ title: "Lab 6 report", day: "2026-11-04", time: "23:59" });
    expect(w.events.some((e) => e.layer === "exams" && e.endDay > e.day)).toBe(true);
    // Never a class among the events: the classes are the cards.
    expect(w.events.some((e) => e.layer === "classes" || e.key.startsWith("class:"))).toBe(false);
  });

  it("serves weeks over GET for the signed-in student, and only valid ranges", async () => {
    const res = await weeksRoute(new Request("http://x/api/timetable?from=2026-11-09&weeks=2"));
    expect(res.headers.get("cache-control")).toContain("private");
    const body = (await res.json()) as { weeks: views.ScheduleWeek[] };
    expect(body.weeks.map((w) => w.monday)).toEqual(["2026-11-09", "2026-11-16"]);
    expect(classesOf(body.weeks).length).toBeGreaterThan(0);
    expect((await weeksRoute(new Request("http://x/api/timetable?from=nope&weeks=2"))).status).toBe(400);
    expect((await weeksRoute(new Request("http://x/api/timetable?from=2026-11-09&weeks=40"))).status).toBe(400);
    // A guest gets the academic calendar, never anyone's classes.
    user.current = null;
    const guest = (await (await weeksRoute(new Request("http://x/api/timetable?from=2026-12-07&weeks=1"))).json()) as { weeks: views.ScheduleWeek[] };
    expect(classesOf(guest.weeks)).toEqual([]);
    expect(guest.weeks[0].events.some((e) => e.layer === "holidays")).toBe(true);
  });

  it("opens with the selected week and two each side, or the month's weeks", () => {
    expect(openingWeeks("week", "2026-11-04")).toEqual({ from: "2026-10-19", count: 5 });
    expect(openingWeeks("month", "2026-11-18")).toMatchObject({ from: "2026-10-19" });
  });
});

describe("both views show the same data", () => {
  it("the page's week and month hold identical classes and events for a range", async () => {
    const week = (await views.schedule(userId, { view: "week", day: "2026-11-02" }, NOW))!;
    const month = (await views.schedule(userId, { view: "month", day: "2026-11-02" }, NOW))!;
    const range = ["2026-11-02", "2026-11-08"] as const;
    const pick = (p: views.SchedulePage) => {
      const b = between(new Map(p.weeks.map((w) => [w.monday, w])), ...range);
      return { classes: b.classes.map((c) => c.key), events: b.events.map((e) => e.key) };
    };
    expect(pick(week)).toEqual(pick(month));
    expect(pick(week).classes.length).toBeGreaterThan(0);
    const weeks = new Map(week.weeks.map((w) => [w.monday, w]));
    const days = Array.from({ length: 7 }, (_, i) => `2026-11-0${2 + i}`);
    const w = weekLayout(weeks, days, { start: 9, end: 20 });
    const m = monthLayout(weeks, days);
    expect([...w.classes.map((c) => c.key), ...w.lanes.map((x) => x.key), ...w.markers.map((x) => x.key), ...w.offs.map((x) => x.key)].sort()).toEqual(
      [...m.classes.map((c) => c.key), ...m.lanes.map((x) => x.key), ...m.single.map((e) => e.key)].sort(),
    );
  });

  it("brings 'Coming up' and the student's own feed, and shows everything whatever the feed carries", async () => {
    await saveFeedLayers(userId, ["holidays"]);
    const s = (await views.schedule(userId, { view: "week", day: "2026-11-02" }, NOW))!;
    expect(s.coming.length).toBeGreaterThan(0);
    expect(new Set(s.coming.map((e) => e.key)).size).toBe(s.coming.length);
    expect(s.subscribe.personal).toBe(true);
    expect(s.feed!.layers.filter((l) => l.on).map((l) => l.id)).toEqual(["holidays"]);
    expect(s.weeks.flatMap((w) => w.events).some((e) => e.layer === "deadlines")).toBe(true);
  });

  it("asks guests to sign in for the week; the month is the academic calendar for them", async () => {
    expect(await views.schedule(null, { view: "week" }, NOW)).toBeNull();
    const g = (await views.schedule(null, { view: "month" }, NOW))!;
    expect(g.feed).toBeNull();
    expect(g.subscribe.personal).toBe(false);
    expect(classesOf(g.weeks)).toEqual([]);
  });
});

describe("the lesson panel is about that dated lesson", () => {
  it("a dated lesson: its LMS name, attendance and mark from the gradebook, its files, the syllabus week", async () => {
    const [w] = await scheduleWeeks(userId, "2026-11-02", 1, NOW);
    const c = w.days[0].classes[0];
    expect(c.lesson).toMatchObject({ lessonId: "L15", title: "Lecture 15", syllabus: "Week 8 · Derivatives", type: "Lecture", grade: "8", lmsHref: "https://newuzbekistan.hero.study/subjects/101" });
    expect(c.lesson.attendance).toEqual({ mark: "late", label: "Late", viaQr: false });
    expect(c.lesson.files.map((f) => f.id)).toEqual(["F1"]);
    expect(c.lesson.absences).toMatchObject({ missed: 9, left: 6 });
    const p = lessonPanel(c);
    expect(p.tags).toEqual(["MATH111", "Lecture"]);
    expect(p.when).toBe("Mon 2 Nov · 10:00–11:20");
    expect(p.attendance).toEqual({ label: "Late", tone: "late", qr: false });
  });

  it("a past pattern lesson finds its gradebook entry by date and time", async () => {
    const [w] = await scheduleWeeks(userId, "2026-10-26", 1, NOW);
    const wed = w.days[2].classes.find((c) => c.code === "MATH111")!;
    expect(wed.lessonIds).toEqual([]);
    expect(wed.lesson.attendance.mark).toBe("absent");
    expect(wed.lesson.title).toBe("Lecture 14");
    expect(wed.lesson.syllabus).toBe("Week 7 · Limits");
  });

  it("a future lesson from the weekly pattern: what is known, no LMS lesson yet", async () => {
    const [w] = await scheduleWeeks(userId, "2026-11-02", 1, NOW);
    const wed = w.days[2].classes.find((c) => c.code === "MATH111")!;
    expect(wed.lesson).toMatchObject({ lessonId: null, title: null, syllabus: "Week 8 · Derivatives", grade: null, files: [] });
    expect(wed.lesson.attendance).toEqual({ mark: "upcoming", label: "Not marked yet", viaQr: false });
    expect(wed.room).toBe("B-204");
    expect(wed.teacher?.name).toBeTruthy();
    // Physics homework is due on Wednesday, not at Tuesday's lesson.
    expect(w.days[1].classes.find((c) => c.code === "PHYS101")!.lesson.homework).toEqual([]);
  });
});

describe("no layer chips on the site", () => {
  it("has no chips in either view and ignores ?layers=", () => {
    for (const file of ["src/screens/desktop/split/TimetableScreen.tsx", "src/screens/desktop/split/CalendarScreen.tsx", "src/screens/mobile/parts/TimetableDays.tsx", "src/screens/mobile/Timetable.tsx"]) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/LayerChips|toggleLayerHref|filters/);
    }
    expect(readFileSync("src/app/(app)/timetable/page.tsx", "utf8")).not.toMatch(/q\.layers|parseLayers/);
  });
});
