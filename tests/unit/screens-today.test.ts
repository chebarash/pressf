import { describe, expect, it } from "vitest";
import { notificationsFixture, TODAY_STATES } from "@/screens/mobile/fixtures";
import { applyChange, orderedFilters, readable, unreadNow } from "@/screens/mobile/notifications/model";
import { caughtUp, checkInClass, feedHasMore, hero, nextExamCard, ratingAsk, ratingBody, showClasses, subtitle, tiles, todayFeed } from "@/screens/mobile/today/model";

describe("Today notifications block (Figma 2.1, 2.5, 2.12)", () => {
  it("keeps read items after the unread ones, without the dot", () => {
    const v = TODAY_STATES["2.1-morning"]();
    const items = [{ ...v.notifications.items[0], read: true }, ...v.notifications.items.slice(1)];
    const feed = todayFeed({ ...v, notifications: { unread: 3, items } });
    expect(feed.map((i) => i.read)).toEqual([false, false, false, true]);
  });

  it("shows All with a full list, not for a single item", () => {
    expect(feedHasMore(TODAY_STATES["2.1-morning"]())).toBe(true);
    expect(feedHasMore(TODAY_STATES["2.12-caught-up"]())).toBe(true);
    expect(feedHasMore(TODAY_STATES["2.5-break"]())).toBe(false);
  });
});

describe("Today screen words (Figma 2.x)", () => {
  it("morning: classes listed, next one marked, no hero", () => {
    const v = TODAY_STATES["2.1-morning"]();
    expect(hero(v)).toBeNull();
    expect(showClasses(v)).toBe(true);
    expect(v.classes.map((c) => c.status)).toEqual(["next", "later", "later"]);
    expect(subtitle(v)).toBe("Week 7 of 16");
    expect(nextExamCard(v)).toEqual({ title: "Thursday", line: "Calculus 1 midterm", sub: "5 Nov · 10:00 · B-204" });
  });

  it("afternoon: finished classes dim, the next one is marked", () => {
    expect(TODAY_STATES["2.2-afternoon"]().classes.map((c) => c.status)).toEqual(["done", "done", "next"]);
  });

  it("classes over: hero says tomorrow's first class, the list goes", () => {
    const v = TODAY_STATES["2.3-over"]();
    expect(hero(v)).toEqual({ eyebrow: "Classes are over", title: "Tomorrow 10:00", line: "Calculus 1", sub: "Gonçalo Pinto · B-204" });
    expect(showClasses(v)).toBe(false);
  });

  it("weekend: weekday title, Monday's first class", () => {
    const v = TODAY_STATES["2.4-weekend"]();
    expect(v.title).toBe("Saturday");
    expect(hero(v)).toMatchObject({ eyebrow: "No classes today", title: "Monday 10:00" });
  });

  it("break: dates of the break, when it ends, what comes next", () => {
    const v = TODAY_STATES["2.5-break"]();
    expect(subtitle(v)).toBe("Break · 21 Dec – 3 Jan");
    expect(hero(v)).toEqual({ eyebrow: "Winter break", title: "Until 4 Jan", line: "Final exams 11–15 Jan", sub: "Revision week starts 4 Jan" });
  });

  it("exam week: the week's exams lead, classes still listed", () => {
    const v = TODAY_STATES["2.6-exams"]();
    expect(subtitle(v)).toBe("Week 8 of 16 · midterms");
    expect(hero(v)).toEqual({ eyebrow: "Your exams this week", title: "Thursday 10:00", line: "Calculus 1 midterm · B-204", sub: "Friday 13:00 · Physics 1 midterm · A-108" });
    expect(showClasses(v)).toBe(true);
    expect(nextExamCard(v)).toBeNull();
  });

  it("quick tiles: absences warn, Scan QR lights up only around a class", () => {
    const morning = tiles(TODAY_STATES["2.1-morning"]());
    expect(morning.find((t) => t.id === "progress")).toMatchObject({ sub: "2 absences left", tone: "warn" });
    expect(morning.find((t) => t.id === "timetable")?.sub).toBe("Next 10:00");
    expect(morning.find((t) => t.id === "qr")?.tone).toBe("default");
    const running = TODAY_STATES["10.1-class-running"]();
    expect(tiles(running).find((t) => t.id === "qr")).toMatchObject({ tone: "accent", sub: "In class now" });
    expect(checkInClass(running)?.name).toBe("Physics 1");
    expect(checkInClass(TODAY_STATES["2.1-morning"]())).toBeNull();
  });

  it("rating ask and caught-up", () => {
    expect(ratingAsk(TODAY_STATES["2.11-rating"]())).toMatchObject({ term: "Spring 2026", level: "shine" });
    expect(ratingAsk(TODAY_STATES["2.6-exams"]())).toBeNull();
    expect(ratingBody([{ name: "Discrete Mathematics", teacher: "Sardor Karimov" }, { name: "Programming 2", teacher: "Emily Carter" }])).toBe(
      "Discrete Mathematics with Sardor Karimov and Programming 2 with Emily Carter. Your rating is what next year's students choose by.",
    );
    expect(caughtUp(TODAY_STATES["2.12-caught-up"]())).toBe(true);
    expect(caughtUp(TODAY_STATES["2.1-morning"]())).toBe(false);
  });
});

describe("Notifications optimistic changes (Figma 2.9, 2.10)", () => {
  const view = notificationsFixture();

  it("opening reads it and confirms what the LMS asked to confirm (no Got it)", () => {
    const read = applyChange(view.sections, { type: "read", ids: ["lms:1", "grade:1"] });
    const flat = read.flatMap((s) => s.items);
    expect(flat.find((i) => i.id === "lms:1")).toMatchObject({ read: true, needsAck: false, acknowledged: true });
    expect(flat.find((i) => i.id === "grade:1")).toMatchObject({ read: true });
    expect(flat.find((i) => i.id === "grade:1")?.acknowledged).toBeFalsy();
  });

  it("mark all read skips items the LMS wants confirmed, and the count follows", () => {
    const ids = readable(view.sections);
    expect(ids).not.toContain("lms:1");
    const after = applyChange(view.sections, { type: "read", ids });
    expect(unreadNow(view, after)).toBe(1);
  });

  it("chips follow the design order", () => {
    expect(orderedFilters(view.filters).map((f) => f.label)).toEqual(["All", "LMS", "Anonymous", "Grades", "Absences", "Files", "Deadlines"]);
  });
});
