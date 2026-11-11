import { beforeEach, describe, expect, it, vi } from "vitest";

const tg = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/telegram/api", async (orig) => ({ ...(await orig<object>()), ...tg }));
vi.mock("@/server/sync/refresh", () => ({ scheduleRefresh: vi.fn(), refreshOnce: vi.fn(), refreshStudent: vi.fn() }));

import { and, eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { feedItems, syllabi } from "@/lib/db/schema";
import { lessonPanel } from "@/screens/shared/schedule/lesson";
import { calendarFeed, personalFeed, saveFeedAlarms, saveFeedLayers } from "@/server/calendar-feed";
import { setAlerts } from "@/server/feed";
import { runReminders } from "@/server/sync/reminders";
import * as views from "@/server/views";
import { syllabus } from "../fixtures/catalog";
import { resetDb } from "../fixtures/db";
import { NOW, seedStudent } from "../fixtures/student";

/**
 * Syllabus milestones end to end: the timetable's marks and lesson panel,
 * Coming up, the calendar feed (description, 📝, VALARM, all-day items) and
 * the evening-before reminder, sent once and only with the setting on.
 * Calculus 1 (MATH111) has lectures Monday and Wednesday 10:00 (weekly pattern).
 */

let userId: string;
const ALL = ["classes", "exams", "deadlines", "holidays", "registration", "syllabus"];

beforeEach(async () => {
  await resetDb();
  tg.send.mockReset();
  tg.send.mockResolvedValue({ ok: true });
  userId = await seedStudent();
  await db().insert(syllabi).values({
    courseCode: "MATH111",
    sourceName: "calc-milestones.pdf",
    matched: true,
    data: syllabus({
      assessment: [
        { name: "Quiz 2", weight_percent: 10, timing: "Week 9" },
        { name: "Group presentations", weight_percent: 15, timing: "Weeks 10–11" },
        { name: "Essay", weight_percent: 10, timing: "Due 19 November 2026" },
        { name: "Participation", weight_percent: 5, timing: "Throughout the semester" },
      ],
      topics_by_week: [{ week: "9", topic: "Integrals" }],
    }),
  });
});

const events = (ics: string) => ics.replace(/\r\n /g, "").split("BEGIN:VEVENT").slice(1).map((b) => b.split("END:VEVENT")[0]);
const field = (block: string, name: string) => block.match(new RegExp(`^${name}[;:](.*)$`, "m"))?.[1]?.trim() ?? null;
const feed = async (layers: string[] | null = ALL) => {
  if (layers) await saveFeedLayers(userId, layers);
  return (await personalFeed((await calendarFeed(userId)).token, NOW))!;
};

describe("the timetable shows syllabus milestones", () => {
  it("marks the class, says it in the lesson panel, and lists it in Coming up", async () => {
    const [w, next] = await views.scheduleWeeks(userId, "2026-11-09", 2, NOW);
    const mon = w.days[0].classes.find((c) => c.code === "MATH111")!;
    expect(mon.milestones).toEqual([expect.objectContaining({ title: "Quiz 2", kind: "quiz", certainty: "inferred", weight: "10%", line: "Quiz 2 · 10% · from the syllabus (likely this lesson)" })]);
    expect(lessonPanel(mon).milestones).toEqual([expect.objectContaining({ line: "Quiz 2 · 10% · from the syllabus (likely this lesson)", likely: true })]);
    // Only that class: Wednesday's has none.
    expect(w.days[2].classes.find((c) => c.code === "MATH111")!.milestones).toEqual([]);
    // A stated date with no class that day: an all-day event in the week's events.
    expect(w.events.some((e) => e.layer === "syllabus")).toBe(false);
    expect(next.events.find((e) => e.key.includes("essay"))).toMatchObject({ title: "Essay · Calculus 1", day: "2026-11-19" });

    const s = (await views.schedule(userId, { view: "week", day: "2026-11-02" }, NOW))!;
    expect(s.coming.filter((e) => e.layer === "syllabus").map((e) => e.title)).toEqual(expect.arrayContaining(["Quiz 2 · Calculus 1"]));
    expect(s.coming.find((e) => e.title === "Quiz 2 · Calculus 1")?.sub).toBe("From the syllabus · 10% · likely");
  });
});

describe("the calendar feed carries the syllabus", () => {
  it("a class: the week topic, the milestone and 📝 in its title, and reminders", async () => {
    const list = events(await feed());
    const quiz = list.find((e) => field(e, "DTSTART") === "20261109T050000Z")!;
    expect(field(quiz, "SUMMARY")).toBe("📝 Calculus 1 · Class");
    const description = field(quiz, "DESCRIPTION")!;
    expect(description).toContain("📝 Quiz 2 (10%) — from the syllabus\\, likely this lesson");
    expect(description).toContain("Syllabus: Week 9 · Integrals");
    // A day before (a quiz), then 15 minutes before the class.
    expect(quiz.match(/TRIGGER:[^\r\n]+/g)).toEqual(["TRIGGER:-P1D", "TRIGGER:-PT15M"]);
    expect(quiz).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:📝 Calculus 1 · Class\r\nTRIGGER:-P1D\r\nEND:VALARM");
    // Wednesday: no milestone, only the class reminder.
    const wed = list.find((e) => field(e, "DTSTART") === "20261111T050000Z")!;
    expect(field(wed, "SUMMARY")).toBe("Calculus 1 · Class");
    expect(wed.match(/TRIGGER:[^\r\n]+/g)).toEqual(["TRIGGER:-PT15M"]);
  });

  it("milestones without a class are all-day events in the Syllabus quizzes layer", async () => {
    const list = events(await feed());
    const talks = list.find((e) => field(e, "SUMMARY") === "📝 Group presentations · Calculus 1")!;
    expect(talks).toMatch(/DTSTART;VALUE=DATE:20261116\r\nDTEND;VALUE=DATE:20261128/);
    expect(field(talks, "DESCRIPTION")).toBe("📝 Group presentations (15%) — from the syllabus\\, sometime this week\\nSyllabus: Weeks 10-11");
    expect(talks.match(/TRIGGER:[^\r\n]+/g)).toEqual(["TRIGGER:-PT6H"]);
    const essay = list.find((e) => field(e, "SUMMARY") === "📝 Essay · Calculus 1")!;
    expect(field(essay, "DESCRIPTION")).toBe("📝 Essay (10%) — from the syllabus\\nSyllabus: Due 19 November 2026");
    // Nothing placed without a timing.
    expect(list.some((e) => field(e, "SUMMARY")?.includes("Participation"))).toBe(false);
  });

  it("the layer off: no milestones anywhere; reminders follow the settings", async () => {
    const off = events(await feed(ALL.filter((l) => l !== "syllabus")));
    expect(off.some((e) => (field(e, "SUMMARY") ?? "").includes("📝"))).toBe(false);
    expect(off.some((e) => (field(e, "DESCRIPTION") ?? "").includes("from the syllabus"))).toBe(false);

    await saveFeedAlarms(userId, { classes: 0, exams: false });
    expect((await feed(ALL)).includes("BEGIN:VALARM")).toBe(false);
    await saveFeedAlarms(userId, { classes: 60 });
    const list = events(await feed(null));
    expect(list.find((e) => field(e, "DTSTART") === "20261111T050000Z")!.match(/TRIGGER:[^\r\n]+/g)).toEqual(["TRIGGER:-PT1H"]);
  });

  it("stays folded and short, and never carries a storage URL", async () => {
    const ics = await feed();
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(ics).not.toMatch(/X-Amz|amazonaws|storage|Signature=/i);
  });
});

describe("the evening before, the bot and the feed say it once", () => {
  // Sunday 8 Nov, 19:00 Tashkent: Monday has Quiz 2.
  const EVENING = new Date("2026-11-08T14:00:00Z");
  const quizItems = () => db().select().from(feedItems).where(and(eq(feedItems.userId, userId), like(feedItems.id, "syllabus:%")));

  it("sends 'Tomorrow: Quiz 2 in Calculus 1 (10%, inferred from the syllabus)' once", async () => {
    await runReminders(userId, EVENING);
    const texts = tg.send.mock.calls.map((c) => (c[1] as { text: string }).text);
    expect(texts.filter((t) => t.includes("Tomorrow: Quiz 2 in Calculus 1 (10%, inferred from the syllabus)"))).toHaveLength(1);
    const items = await quizItems();
    expect(items.map((i) => i.id)).toEqual(["syllabus:MATH111:2026-11-09:quiz-2:eve"]);
    expect(items[0]).toMatchObject({ kind: "deadline", title: "Tomorrow: Quiz 2 in Calculus 1 (10%, inferred from the syllabus)" });

    tg.send.mockClear();
    await runReminders(userId, new Date(EVENING.getTime() + 20 * 60_000));
    expect(tg.send.mock.calls.map((c) => (c[1] as { text: string }).text).filter((t) => t.includes("Quiz 2"))).toEqual([]);
    expect(await quizItems()).toHaveLength(1);
  });

  it("not in the afternoon, and nothing with the setting off", async () => {
    await runReminders(userId, new Date("2026-11-08T09:00:00Z"));
    expect(await quizItems()).toHaveLength(0);
    await setAlerts(userId, { syllabus: false });
    await runReminders(userId, EVENING);
    expect(tg.send.mock.calls.map((c) => (c[1] as { text: string }).text).some((t) => t.includes("Quiz 2"))).toBe(false);
    expect(await quizItems()).toHaveLength(0);
  });

  it("a stated date reads 'from the syllabus'", async () => {
    // Wednesday 18 Nov evening: the essay is due Thursday 19 Nov.
    await runReminders(userId, new Date("2026-11-18T14:00:00Z"));
    const texts = tg.send.mock.calls.map((c) => (c[1] as { text: string }).text);
    expect(texts.some((t) => t.includes("Tomorrow: Essay in Calculus 1 (10%, from the syllabus)"))).toBe(true);
  });
});
