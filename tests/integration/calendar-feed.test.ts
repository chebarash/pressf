import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => ({ scheduleRefresh: vi.fn() }));
vi.mock("@/server/sync/refresh", () => refresh);

import { eq } from "drizzle-orm";
import { GET } from "@/app/calendar/feed/[token]/route";
import { db } from "@/lib/db";
import { calendarFeeds } from "@/lib/db/schema";
import { deleteAccount } from "@/server/account";
import { calendarFeed, feedOwner, feedSettings, personalFeed, personalSubscription, resetCalendarFeed, saveFeedLayers } from "@/server/calendar-feed";
import { resetDb } from "../fixtures/db";
import { NOW, seedStudent } from "../fixtures/student";

let userId: string;
const ALL = ["classes", "exams", "deadlines", "holidays", "registration"];

beforeEach(async () => {
  await resetDb();
  refresh.scheduleRefresh.mockReset();
  userId = await seedStudent();
});

const get = (token: string) => GET(new Request(`https://pressf.test/calendar/feed/${token}`), { params: Promise.resolve({ token }) });
/** The VEVENT blocks of a feed, unfolded. */
const events = (ics: string) => ics.replace(/\r\n /g, "").split("BEGIN:VEVENT").slice(1).map((b) => b.split("END:VEVENT")[0]);
const field = (block: string, name: string) => block.match(new RegExp(`^${name}[;:](.*)$`, "m"))?.[1]?.trim() ?? null;

describe("calendar feed token", () => {
  it("is made on first use, stays the same, and only its HMAC is stored", async () => {
    const a = await calendarFeed(userId);
    const b = await calendarFeed(userId);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(b.token).toBe(a.token);
    expect(a.layers).toBeNull();
    const [row] = await db().select().from(calendarFeeds).where(eq(calendarFeeds.userId, userId));
    expect(JSON.stringify(row)).not.toContain(a.token);
    expect(personalSubscription(a.token).google).toBe(
      `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(`webcal://pressf.chebarash.uz/calendar/feed/${a.token}.ics`)}`,
    );
  });

  it("differs per student", async () => {
    const other = await seedStudent({ email: "o@newuu.uz", telegramId: "222" });
    expect((await calendarFeed(other)).token).not.toBe((await calendarFeed(userId)).token);
    expect((await feedOwner((await calendarFeed(other)).token))?.userId).toBe(other);
  });

  it("reset revokes the old link and keeps the layers", async () => {
    const { token: old } = await calendarFeed(userId);
    await saveFeedLayers(userId, ["holidays"]);
    const next = await resetCalendarFeed(userId);
    expect(next).not.toBe(old);
    expect(await feedOwner(old)).toBeNull();
    expect((await get(`${old}.ics`)).status).toBe(404);
    expect(await feedOwner(next)).toEqual({ userId, layers: ["holidays"] });
    expect((await calendarFeed(userId)).token).toBe(next);
  });

  it("dies with the account", async () => {
    const { token } = await calendarFeed(userId);
    await deleteAccount(userId);
    expect(await feedOwner(token)).toBeNull();
    expect((await get(`${token}.ics`)).status).toBe(404);
  });
});

describe("calendar feed route", () => {
  it("serves the feed for a valid token only", async () => {
    const { token } = await calendarFeed(userId);
    const ok = await get(`${token}.ics`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(ok.headers.get("cache-control")).toBe("private, max-age=300");
    expect(await ok.text()).toContain("BEGIN:VCALENDAR");

    for (const bad of [token, `${token.slice(0, -1)}x.ics`, "nope.ics", `${token}x.ics`, "../calendar.ics"]) {
      const res = await get(bad);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain("VCALENDAR");
    }
  });

  it("never calls the LMS or schedules a sync", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { token } = await calendarFeed(userId);
    await personalFeed(token, new Date(NOW.getTime() + 30 * 86_400_000)); // snapshot long stale
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(refresh.scheduleRefresh).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("calendar feed content", () => {
  const feed = async (layers: string[] | null) => {
    if (layers) await saveFeedLayers(userId, layers);
    return (await personalFeed((await calendarFeed(userId)).token, NOW))!;
  };

  it("names the calendar after the student and asks for hourly refresh", async () => {
    const ics = await feed(ALL);
    expect(ics).toContain("X-WR-CALNAME:Press F · Shamsiddin\r\n");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n");
    expect(ics).toContain("X-PUBLISHED-TTL:PT1H\r\n");
    expect(ics).not.toContain("s@newuu.uz");
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });

  it("has the student's classes in UTC with type, room and teacher, then the weekly pattern", async () => {
    const list = events(await feed(["classes"]));
    const calc = list.find((e) => field(e, "DTSTART") === "20261102T050000Z")!;
    expect(field(calc, "SUMMARY")).toBe("Calculus 1 · Lecture");
    expect(field(calc, "DTEND")).toBe("20261102T062000Z");
    expect(field(calc, "LOCATION")).toBe("B-204");
    expect(field(calc, "DESCRIPTION")).toBe("MATH111 · Lecture\\nRoom B-204\\nGonçalo Pinto");
    // Tuesday's Physics comes from the weekly pattern (outside the synced window), 13:00 Tashkent = 08:00Z.
    expect(list.some((e) => field(e, "DTSTART") === "20261103T080000Z" && field(e, "SUMMARY")?.startsWith("Physics 1"))).toBe(true);
    // Rest of the term's class weeks: not the winter break, not past the last Fall teaching week.
    const starts = list.map((e) => field(e, "DTSTART")!);
    expect(starts.some((s) => s.startsWith("20261216"))).toBe(true);
    expect(starts.some((s) => s.startsWith("20261223"))).toBe(false);
    expect(starts.some((s) => s.startsWith("20270106"))).toBe(true);
    expect(starts.every((s) => s < "20270109")).toBe(true);
    // Only classes: no holidays, deadlines or phases.
    expect(list.every((e) => field(e, "DTSTART")?.includes("T"))).toBe(true);
    expect(list.some((e) => field(e, "SUMMARY")?.startsWith("Due:"))).toBe(false);
  });

  it("honours the chosen layers", async () => {
    const holidays = events(await feed(["holidays"]));
    expect(holidays.map((e) => field(e, "SUMMARY"))).toContain("Constitution Day");
    expect(holidays.find((e) => field(e, "SUMMARY") === "Constitution Day")).toMatch(/DTSTART;VALUE=DATE:20261208\r?\nDTEND;VALUE=DATE:20261209/);
    expect(holidays.some((e) => /Calculus|Due:|exams/.test(field(e, "SUMMARY") ?? ""))).toBe(false);

    const deadlines = events(await feed(["deadlines"]));
    expect(deadlines).toHaveLength(1);
    expect(field(deadlines[0], "SUMMARY")).toBe("Due: Lab 6 report");
    expect(field(deadlines[0], "DTSTART")).toBe("20261104T185900Z");
    expect(field(deadlines[0], "DESCRIPTION")).toBe("Physics 1");

    const exams = events(await feed(["exams"]));
    expect(exams.find((e) => field(e, "SUMMARY") === "Midterm exams")).toMatch(/DTSTART;VALUE=DATE:20261102/);
    expect(exams.some((e) => field(e, "SUMMARY") === "Final exams")).toBe(true);

    expect(events(await feed([]))).toHaveLength(0);
  });

  it("carries every layer, classes included, until the student changes its settings", async () => {
    const summaries = events(await feed(null)).map((e) => field(e, "SUMMARY"));
    expect(summaries).toContain("Due: Lab 6 report");
    expect(summaries).toContain("Constitution Day");
    expect(summaries.some((s) => s?.startsWith("Calculus 1 ·"))).toBe(true);
    expect(await feedSettings(userId)).toEqual(ALL.map((id) => expect.objectContaining({ id, on: true })));
  });

  it("reads only its own settings (In Google Calendar), turned one switch at a time", async () => {
    await saveFeedLayers(userId, ALL.filter((l) => l !== "classes"));
    expect((await feedSettings(userId)).filter((l) => !l.on).map((l) => l.id)).toEqual(["classes"]);
    const summaries = events(await feed(null)).map((e) => field(e, "SUMMARY"));
    expect(summaries.some((s) => s?.startsWith("Calculus 1 ·"))).toBe(false);
    expect(summaries).toContain("Constitution Day");
    expect((await feedOwner((await calendarFeed(userId)).token))?.layers).toEqual(["exams", "deadlines", "holidays", "registration"]);
  });

  it("keeps UIDs stable between polls and unique within a feed", async () => {
    const a = events(await feed(ALL)).map((e) => field(e, "UID"));
    const later = new Date(NOW.getTime() + 3600_000);
    const b = events((await personalFeed((await calendarFeed(userId)).token, later))!).map((e) => field(e, "UID"));
    expect(new Set(a).size).toBe(a.length);
    expect(b).toEqual(a);
    expect(a.every((uid) => uid?.endsWith("@pressf.chebarash.uz"))).toBe(true);
  });
});
