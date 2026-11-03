import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tg = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/telegram/api", async (orig) => ({ ...(await orig<object>()), ...tg }));
vi.mock("@/server/sync/refresh", () => ({ scheduleRefresh: vi.fn(), refreshOnce: vi.fn(), refreshStudent: vi.fn() }));
const lms = vi.hoisted(() => ({ sessionFor: vi.fn(), currentUser: vi.fn() }));
vi.mock("@/lib/lms/store", async (orig) => ({ ...(await orig<object>()), sessionFor: lms.sessionFor }));
vi.mock("@/lib/lms/client", async (orig) => ({ ...(await orig<object>()), currentUser: lms.currentUser }));

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { examSeats, examSlots, examSources, examWindows, feedItems, lmsAccounts, lmsCache, userState, users } from "@/lib/db/schema";
import { POST as importRoute } from "@/app/api/admin/exams/import/route";
import { importJson } from "@/server/exam-import";
import { examsFor } from "@/server/exams";
import { runReminders } from "@/server/sync/reminders";
import { loadStudent } from "@/server/views/student";
import { classesBetween } from "@/server/views/classes";
import * as views from "@/server/views";
import { SNAPSHOT_KEY } from "@/server/sync/types";
import { resetDb } from "../fixtures/db";
import { cache, NOW, seedStudent, snapshot } from "../fixtures/student";

/** Synthetic IDs only. 100001 uses Press F; 100099 does not. */
const MINE = "100001";
const STRANGER = "100099";

const schedule = (room = "MATH 106", start = "12:30") => ({
  window: { name: "Midterm", starts: "2026-11-02", ends: "2026-11-06" },
  source: { label: "Test midterm sheet", url: "https://docs.google.com/spreadsheets/d/TESTTESTTESTTESTTESTTEST/edit" },
  exams: [
    { course: "MATH111 Calculus 1 (120 min)", date: "2026-11-02", start, rooms: ["MATH 105", "MATH 106", "MATH 107"] },
    { course: "PHYS101 Physics 1", date: "2026-11-03", start: "9:45 AM", durationMin: 90, rooms: ["UCA204", "UCA205"] },
  ],
  seats: [
    { studentId: MINE, course: "MATH111", date: "2026-11-02", start, room },
    { studentId: STRANGER, course: "MATH111", date: "2026-11-02", start, room: "MATH 107" },
  ],
});

let me: string;
let other: string;

beforeEach(async () => {
  await resetDb();
  tg.send.mockReset();
  tg.send.mockResolvedValue({ message_id: 1 });
  me = await seedStudent();
  // The fixture's midterm override shows classes; exam tests use the calendar rule (hide).
  await db().delete(examWindows);
  await db().update(lmsCache).set({ data: { ...cache, profile: { ...cache.profile!, studentId: MINE } } }).where(eq(lmsCache.userId, me));
  // A second student, enrolled in Physics only, with no seat in the sheet.
  const [u] = await db().insert(users).values({ email: "b@newuu.uz", telegramId: "222" }).returning();
  other = u.id;
  await db().insert(lmsCache).values({ userId: other, data: { ...cache, enrollment: { semesterName: "Fall 2026", codes: ["PHYS101"], courses: [] }, profile: { ...cache.profile!, studentId: "100002" } }, syncedAt: NOW });
  await db().insert(userState).values({ userId: other, snapshot: { [SNAPSHOT_KEY]: snapshot({ courses: [], schedule: [] }) } });
  await db().insert(lmsAccounts).values({ userId: other, sealedPassword: "v1.x.y.z", status: "active" });
});

afterEach(() => vi.useRealTimers());

describe("import", () => {
  it("keeps exams for everyone and seats only for Press F students", async () => {
    const { stats } = await importJson(schedule(), null, NOW);
    expect(stats).toMatchObject({ exams: 2, courses: 2, coursesMatched: 2, unmatched: [], seatRows: 2, studentsInSheet: 2, usersMatched: 1, seatsKept: 1 });
    const seats = await db().select().from(examSeats);
    expect(seats.map((s) => [s.userId, s.code, s.room])).toEqual([[me, "MATH111", "MATH 106"]]);
    // Nothing about the other student is stored anywhere.
    const dump = JSON.stringify(await db().execute(sql`select * from exam_seats, exam_slots, exam_sources`));
    expect(dump).not.toContain(STRANGER);
    const slots = await db().select().from(examSlots);
    expect(slots.find((s) => s.code === "PHYS101")).toMatchObject({ courseId: "102", day: "2026-11-03", start: "09:45", minutes: 90, rooms: ["UCA 204", "UCA 205"] });
  });

  it("reads the student ID of a student synced before IDs were kept (GET /users/current)", async () => {
    await db().update(lmsCache).set({ data: cache }).where(eq(lmsCache.userId, me));
    lms.sessionFor.mockResolvedValue({ token: "t" });
    lms.currentUser.mockResolvedValue({ id: "1", email: "s@newuu.uz", external_id: Number(MINE) });
    const { stats } = await importJson(schedule(), null, NOW);
    expect(stats.usersMatched).toBe(1);
    expect(lms.currentUser).toHaveBeenCalledTimes(1);
    const [row] = await db().select().from(lmsCache).where(eq(lmsCache.userId, me));
    expect((row.data as typeof cache & { profile: { studentId?: string } }).profile.studentId).toBe(MINE);
  });

  it("shows a student their seat, and a classmate without a seat the course's rooms", async () => {
    await importJson(schedule(), null, NOW);
    const mine = await examsFor((await loadStudent(me))!, "2026-11-02", "2026-11-06");
    expect(mine.map((e) => [e.code, e.matched, e.room])).toEqual([["MATH111", "id", "MATH 106"]]);
    const theirs = await examsFor((await loadStudent(other))!, "2026-11-02", "2026-11-06");
    expect(theirs.map((e) => [e.code, e.matched, e.room, e.rooms])).toEqual([["PHYS101", "course", null, ["UCA 204", "UCA 205"]]]);
    expect(theirs[0].end.getTime() - theirs[0].start.getTime()).toBe(90 * 60_000);
  });

  it("is idempotent and tells a student once when their room changes", async () => {
    await importJson(schedule(), null, NOW);
    await importJson(schedule(), null, NOW);
    expect(tg.send).not.toHaveBeenCalled();
    const { stats } = await importJson(schedule("MATH 205"), null, NOW);
    expect(stats.changes).toBe(1);
    const items = await db().select().from(feedItems).where(eq(feedItems.userId, me));
    expect(items.map((i) => [i.title, i.body])).toEqual([["Room changed: MATH111 Calculus 1", "Mon 2 Nov 12:30–14:30 · MATH 205 (was MATH 106)"]]);
    expect(tg.send).toHaveBeenCalledTimes(1);
    const [seat] = await db().select().from(examSeats);
    expect(seat.was).toBe("MATH 106");
    await importJson(schedule("MATH 205"), null, NOW);
    expect(tg.send).toHaveBeenCalledTimes(1);
    expect((await db().select().from(examSeats))[0].was).toBe("MATH 106");
  });

  it("tells course students without a seat when the course's time moves", async () => {
    await importJson(schedule(), null, NOW);
    const moved = schedule();
    moved.exams[1].start = "3:00 PM";
    await importJson(moved, null, NOW);
    const items = await db().select().from(feedItems).where(eq(feedItems.userId, other));
    expect(items.map((i) => i.title)).toEqual(["Time changed: PHYS101 Physics 1"]);
  });

  it("takes the operator's JSON at the import endpoint with the cron secret", async () => {
    const post = (body: unknown, auth?: string) => importRoute(new Request("https://pressf.test/api/admin/exams/import", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) }));
    expect((await post(schedule())).status).toBe(401);
    expect((await post(schedule(), "Bearer wrong")).status).toBe(401);
    const bad = await post({ window: { name: "Midterm", starts: "2026-11-02" } }, "Bearer cron-secret");
    expect(bad.status).toBe(400);
    const ok = await post(schedule(), "Bearer cron-secret");
    expect(ok.status).toBe(200);
    expect((await ok.json()).stats.usersMatched).toBe(1);
    expect((await db().select().from(examSources)).map((s) => [s.origin, s.status, s.windowKey])).toEqual([["import", "ok", "midterm:2026-11-02"]]);
  });
});

describe("exam week", () => {
  it("hides regular classes and shows exams instead during the window", async () => {
    await importJson(schedule(), null, NOW);
    const student = (await loadStudent(me))!;
    const classes = await classesBetween(student, "2026-11-02", "2026-11-03", NOW);
    expect(classes.map((c) => [c.code, c.kind, c.time, c.room])).toEqual([["MATH111", "exam", "12:30", "MATH 106"]]);
    expect(classes[0].exam).toMatchObject({ kind: "midterm", matched: "id", note: "Your seat, from the university sheet" });
    const t = await views.timetable(me, "2026-11-02", NOW);
    expect(t!.examWeek).toBe("No regular classes during midterm week");
    expect(t!.classes.map((c) => [c.name, c.lesson])).toEqual([["Calculus 1", "Midterm"]]);
    const today = await views.today(me, NOW);
    expect(today!.examWeek).toBe("No regular classes during midterm week");
    expect(today!.nextExams.map((e) => e.label)).toEqual(["Calculus 1 midterm"]);
  });

  it("changes nothing outside the window, or when an admin shows classes", async () => {
    const student = (await loadStudent(me))!;
    const after = await classesBetween(student, "2026-11-09", "2026-11-09", NOW);
    expect(after.map((c) => c.kind)).not.toContain("exam");
    expect(after.length).toBeGreaterThan(0);
    await db().insert(examWindows).values({ key: "midterm:2026-11-02", kind: "midterm", name: "Midterm exams", starts: "2026-11-02", ends: "2026-11-06", classes: "show" });
    const shown = await classesBetween(student, "2026-11-02", "2026-11-02", NOW);
    expect(shown.map((c) => c.kind)).toEqual(["lecture"]);
    expect((await views.timetable(me, "2026-11-02", NOW))!.examWeek).toBeNull();
  });

  it("reminds the evening before and an hour before, once each", async () => {
    await importJson(schedule(), null, NOW);
    const titles = () => tg.send.mock.calls.map((c) => String((c[1] as { text: string }).text).split("\n")[0]);
    await runReminders(me, new Date("2026-11-02T06:40:00Z")); // 11:40, 50 min before 12:30
    await runReminders(me, new Date("2026-11-02T06:50:00Z"));
    expect(titles().filter((t) => /midterm/.test(t))).toEqual(["<b>Calculus 1 midterm at 12:30</b>"]);
    tg.send.mockClear();
    await importJson({ ...schedule(), exams: [{ ...schedule().exams[0], date: "2026-11-03" }], seats: [{ ...schedule().seats[0], date: "2026-11-03" }] }, null, NOW);
    tg.send.mockClear();
    await runReminders(me, new Date("2026-11-02T13:30:00Z")); // 18:30 the evening before
    expect(titles().filter((t) => /tomorrow/.test(t))).toEqual(["<b>Calculus 1 midterm tomorrow, 12:30</b>"]);
  });
});
