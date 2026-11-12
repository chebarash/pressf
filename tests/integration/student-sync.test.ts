import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lms = vi.hoisted(() => ({
  notifications: vi.fn(), gradebookSemesters: vi.fn(), gradebookData: vi.fn(), homework: vi.fn(), scheduleList: vi.fn(),
  markNotificationRead: vi.fn(), acknowledgeNotification: vi.fn(), semesterCalendar: vi.fn(),
}));
const store = vi.hoisted(() => ({ sessionFor: vi.fn() }));
const tg = vi.hoisted(() => ({ send: vi.fn(), sendWidget: vi.fn(async () => ({ message_id: 7 })), editWidgetData: vi.fn(), pinMessage: vi.fn(), unpinMessage: vi.fn(), deleteMessage: vi.fn() }));
const cacheMod = vi.hoisted(() => ({ preloadUser: vi.fn() }));
const filesMod = vi.hoisted(() => ({ filesAreStale: vi.fn(), harvestCourseFiles: vi.fn() }));
vi.mock("@/lib/lms/client", async (orig) => ({ ...(await orig<object>()), ...lms }));
vi.mock("@/lib/lms/store", () => store);
// Views schedule a background sync when stale; keep it out of these tests.
vi.mock("@/server/sync/refresh", () => ({ scheduleRefresh: vi.fn(), refreshOnce: vi.fn(), refreshStudent: vi.fn() }));
vi.mock("@/lib/telegram/api", async (orig) => ({ ...(await orig<object>()), ...tg }));
vi.mock("@/lib/lms/cache", async (orig) => ({ ...(await orig<object>()), ...cacheMod }));
vi.mock("@/lib/lms/files", async (orig) => ({ ...(await orig<object>()), ...filesMod }));

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { feedItems, lmsAccounts, lmsFiles, userState } from "@/lib/db/schema";
import { POST as studentsCron } from "@/app/api/cron/students/route";
import { POST as remindersCron } from "@/app/api/cron/reminders/route";
import { feed, setAlerts } from "@/server/feed";
import { acknowledge, markAllRead, readNotification } from "@/server/sync/actions";
import { runRemindersBatch, runSyncBatch } from "@/server/sync/batch";
import { runReminders } from "@/server/sync/reminders";
import { JOBS, runJob, schedulerEnabled, withJobLock } from "@/server/scheduler";
import { syncStudent } from "@/server/sync/student";
import { SNAPSHOT_KEY, emptySnapshot, type SyncSnapshot } from "@/server/sync/types";
import * as views from "@/server/views";
import { resetDb } from "../fixtures/db";
import { NOW, seedStudent, snapshot, unix } from "../fixtures/student";

let userId: string;
const at = (iso: string) => new Date(iso);
/** 10:30 Monday in Tashkent: not quiet hours. */
const DAY = NOW;

const gradebook = (over: { average?: number; events?: object[]; admit?: object } = {}) => ({
  resultSubjects: {
    "101": { subject: { name: "Calculus 1" }, final_grade: { mark: null }, average: over.average ?? 74, rating: 51, admit: over.admit ?? { absence_count_all: 9, avaibale_count_all: 6, lessons_count: 60 }, events: over.events ?? [{ lesson_name: "Lecture 14", lesson_type: 0, status: 1, time: unix("2026-10-26T10:00:00+05:00") }] },
  },
});

function lmsReturns(over: { gradebook?: object; notes?: object[] } = {}) {
  lms.notifications.mockResolvedValue({ all: over.notes ?? [{ id: 55, title: "Quiz 6 opens tomorrow at 09:00", body: "<p>One attempt</p>", publicate_at: unix("2026-11-02T08:00:00+05:00"), read: 0, required: 1, acquainted: 0 }] });
  lms.gradebookSemesters.mockResolvedValue([{ id: 1, semester_id: 8, semester_name: "Fall 2026", is_open: 1, year_of_study: 4 }]);
  lms.gradebookData.mockResolvedValue(over.gradebook ?? gradebook());
  lms.homework.mockResolvedValue([{ id: 5, subject: "Physics 1", theme_name: "Lab 6 report", time: unix("2026-11-02T13:30:00+05:00"), status_name: "Not ready" }]);
  lms.scheduleList.mockResolvedValue([{ events: [{ begin_time: unix("2026-11-03T13:00:00+05:00"), end_time: unix("2026-11-03T14:20:00+05:00"), subject_id: "101", auditorium: "B-110", lesson_id: "L16", employee_id: "T1", subjectType: { name: "Lecture" } }] }]);
}

const texts = () => tg.send.mock.calls.map((c) => (c[1] as { text: string }).text);
/** A message as read in the chat: without its HTML tags (stripped until none are left). */
const plain = (t: string) => {
  let prev;
  do {
    prev = t;
    t = t.replace(/<[^<>]*>/g, "");
  } while (t !== prev);
  return t;
};
const sentTitles = () => texts().map((t) => plain(t.split("\n")[0]));

beforeEach(async () => {
  await resetDb();
  for (const f of [...Object.values(lms), store.sessionFor, tg.send, cacheMod.preloadUser, filesMod.filesAreStale, filesMod.harvestCourseFiles]) f.mockReset();
  store.sessionFor.mockResolvedValue({ token: "t" });
  tg.send.mockResolvedValue({ message_id: 1 });
  cacheMod.preloadUser.mockResolvedValue(null);
  filesMod.filesAreStale.mockResolvedValue(false);
  userId = await seedStudent({ snapshot: emptySnapshot() });
  lmsReturns();
});
afterEach(() => vi.restoreAllMocks());

const snap = async () => ((await db().select().from(userState).where(eq(userState.userId, userId)))[0].snapshot[SNAPSHOT_KEY]) as SyncSnapshot;

describe("syncStudent", () => {
  it("stores the LMS picture and announces only what is new", async () => {
    const r = await syncStudent(userId, DAY);
    expect(r).toMatchObject({ ok: true });
    const s = await snap();
    expect(s.courses[0]).toMatchObject({ subjectId: "101", average: 74 });
    expect(s.schedule[0]).toMatchObject({ room: "B-110", kind: "lecture" });
    expect(s.semesters[0]).toMatchObject({ term: "Fall 2026", open: true });
    expect((await feed(userId)).map((i) => [i.id, i.needsAck])).toEqual([["lms:55", true]]);
    // First sync: the announcement goes out; no grade or absence alerts from a first look.
    expect(sentTitles()).toEqual(["LMS · Quiz 6 opens tomorrow at 09:00"]);
    expect(tg.send.mock.calls[0][0]).toBe("111");

    // Second sync: a new mark, an absence, a room change. Each alert once.
    tg.send.mockClear();
    lmsReturns({ gradebook: gradebook({ average: 76, admit: { absence_count_all: 10, avaibale_count_all: 5, lessons_count: 60 }, events: [{ lesson_name: "Lecture 14", lesson_type: 0, status: 3, time: unix("2026-10-26T10:00:00+05:00") }, { lesson_name: "Quiz 6", lesson_type: 1, status: 1, time: unix("2026-11-01T10:00:00+05:00"), mark: 9 }] }) });
    lms.scheduleList.mockResolvedValue([{ events: [{ begin_time: unix("2026-11-03T13:00:00+05:00"), end_time: unix("2026-11-03T14:20:00+05:00"), subject_id: "101", auditorium: "A-108", lesson_id: "L16", employee_id: "T1" }] }]);
    await syncStudent(userId, new Date(DAY.getTime() + 30 * 60_000));
    expect(sentTitles().sort()).toEqual(["Marked absent in Calculus 1", "New grade in Calculus 1", "Room change for tomorrow"]);
    const grade = tg.send.mock.calls.find((c) => (c[1] as { text: string }).text.includes("New grade"))![1] as { text: string; keyboard: { inline_keyboard: Array<Array<{ text: string; web_app?: { url: string } }>> } };
    expect(grade.text).toBe("<b>New grade in Calculus 1</b>\n🟢 Quiz 6: 9\nAverage now 76");
    expect(grade.keyboard.inline_keyboard[0][0].text).toBe("See progress");
    expect(grade.keyboard.inline_keyboard[0][0].web_app?.url).toMatch(/\/progress\/101$/);

    tg.send.mockClear();
    await syncStudent(userId, new Date(DAY.getTime() + 60 * 60_000));
    expect(tg.send).not.toHaveBeenCalled();
  });

  it("holds non-urgent alerts in quiet hours and sends them after", async () => {
    await syncStudent(userId, DAY);
    tg.send.mockClear();
    lmsReturns({ notes: [{ id: 56, title: "Room booking", publicate_at: unix("2026-11-02T23:00:00+05:00") }] });
    const night = at("2026-11-02T18:30:00Z"); // 23:30 Tashkent
    await syncStudent(userId, night);
    expect(tg.send).not.toHaveBeenCalled();
    await syncStudent(userId, at("2026-11-03T03:30:00Z")); // 08:30
    expect(sentTitles()).toEqual(["LMS · Room booking"]);
  });

  it("respects alert settings", async () => {
    await setAlerts(userId, { announcement: false });
    await syncStudent(userId, DAY);
    expect(tg.send).not.toHaveBeenCalled();
    expect(await feed(userId)).toHaveLength(1);
  });

  it("keeps the last good data when the LMS is down", async () => {
    await syncStudent(userId, DAY);
    for (const f of [lms.notifications, lms.gradebookSemesters, lms.gradebookData, lms.homework, lms.scheduleList]) f.mockRejectedValue(new Error("LMS 502"));
    const r = await syncStudent(userId, new Date(DAY.getTime() + 3600_000));
    expect(r.ok).toBe(false);
    const s = await snap();
    expect(s.at).toBe(DAY.toISOString());
    expect(s.error).toContain("LMS 502");
    expect(s.courses).toHaveLength(1);
    expect((await views.today(userId, DAY))!.banner?.kind).toBe("lms-down");
  });

  it("tells the student once when the saved password stops working", async () => {
    store.sessionFor.mockResolvedValue(null);
    await db().update(lmsAccounts).set({ status: "invalid" }).where(eq(lmsAccounts.userId, userId));
    await syncStudent(userId, DAY);
    await syncStudent(userId, DAY);
    expect(sentTitles()).toEqual(["Sync stopped"]);
  });

  it("announces new lesson files once, bundled per course", async () => {
    await syncStudent(userId, DAY);
    tg.send.mockClear();
    await db().delete(lmsFiles);
    await db().insert(lmsFiles).values([
      { id: "N1", courseId: "101", code: "MATH111", name: "Week 8_Midterm review slides.pdf", storageKey: "k1" },
      { id: "N2", courseId: "101", code: "MATH111", name: "Week 8 Mock midterm with answers.pdf", storageKey: "k2" },
    ]);
    await setAlerts(userId, { file: true });
    await syncStudent(userId, new Date(DAY.getTime() + 30 * 60_000));
    expect(texts()).toEqual(["<b>2 new files in Calculus 1</b>\nWeek 8\n• Midterm review slides\n• Mock midterm with answers"]);
  });
});

describe("batch and cron", () => {
  it("one failing student does not stop the batch", async () => {
    const other = await seedStudent({ email: "b@newuu.uz", telegramId: "222", snapshot: emptySnapshot() });
    store.sessionFor.mockImplementation(async (id: string) => {
      if (id === userId) throw new Error("boom");
      return { token: "t" };
    });
    lms.gradebookData.mockImplementation(async () => gradebook());
    const r = await runSyncBatch({ now: DAY, pauseMs: 0 });
    expect(r.processed).toBe(2);
    expect(r.ok + r.skipped).toBe(2);
    expect((await db().select().from(userState).where(eq(userState.userId, other)))[0].snapshot[SNAPSHOT_KEY]).toBeTruthy();
    // Synced a moment ago: not due again.
    expect((await runSyncBatch({ now: DAY, pauseMs: 0 })).processed).toBe(1);
  });

  it("guards the cron routes with CRON_SECRET", async () => {
    expect((await studentsCron(new Request("https://x/api/cron/students", { method: "POST" }))).status).toBe(401);
    expect((await remindersCron(new Request("https://x/api/cron/reminders", { method: "POST", headers: { authorization: "Bearer nope" } }))).status).toBe(401);
    const ok = await remindersCron(new Request("https://x/api/cron/reminders", { method: "POST", headers: { authorization: "Bearer cron-secret" } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ processed: 1 });
  });
});

describe("reminders", () => {
  beforeEach(async () => {
    await resetDb();
    userId = await seedStudent({ snapshot: snapshot({ homework: [{ id: 5, subject: "Physics 1", theme_name: "Lab 6 report", time: unix("2026-11-02T13:30:00+05:00"), status_name: "Not ready" }] }) });
  });

  it("sends the morning digest once on a school day", async () => {
    const morning = at("2026-11-02T02:35:00Z"); // 07:35
    await runReminders(userId, morning);
    await runReminders(userId, new Date(morning.getTime() + 5 * 60_000));
    expect(texts()).toEqual(["<b>Today: 1 class</b>\n10:00 Calculus 1 · B-204\nDue tonight: Physics 1 lab 6 report, 13:30"]);
  });

  it("reminds 15 minutes before a class, then to scan the QR", async () => {
    await runReminders(userId, at("2026-11-02T04:47:00Z")); // 09:47
    expect(texts().map(plain)).toEqual(["Calculus 1 in 15 minutes\nB-204 · Gonçalo Pinto · Midterm review slides is up"]);
    expect(texts()[0]).toContain(`<tg-time unix="${Date.parse("2026-11-02T05:00:00Z") / 1000}" format="r">`);
    tg.send.mockClear();
    await runReminders(userId, at("2026-11-02T05:06:00Z")); // 10:06
    expect(sentTitles().filter((t) => !t.startsWith("Rate"))).toEqual(["Calculus 1 has started"]);
  });

  it("sends the 3-hour deadline reminder as a feed item too", async () => {
    await runReminders(userId, at("2026-11-02T05:20:00Z")); // 10:20 — 13:30 minus 3 h is 10:30
    tg.send.mockClear();
    await runReminders(userId, at("2026-11-02T05:31:00Z"));
    expect(sentTitles()).toContain("Due in 3 hours: Lab 6 report");
    expect((await feed(userId)).map((i) => i.id)).toContain("deadline:5:3");
  });

  it("asks to rate past courses at most three times, three days apart", async () => {
    const d = (n: number) => new Date(Date.parse("2026-11-02T07:00:00Z") + n * 86_400_000); // 12:00
    for (const n of [0, 1, 3, 6, 9, 12]) await runReminders(userId, d(n));
    expect(sentTitles().filter((t) => t.startsWith("Rate"))).toEqual(["Rate Fall 2025 — 1 course", "Rate Fall 2025 — 1 course", "Rate Fall 2025 — 1 course"]);
  });
});

describe("feed actions write back to the LMS", () => {
  it("marks read and acknowledges in both places", async () => {
    await db().insert(feedItems).values([
      { userId, id: "lms:55", kind: "announcement", title: "Quiz", at: DAY, needsAck: true },
      { userId, id: "lms:56", kind: "announcement", title: "News", at: DAY },
      { userId, id: "grade:x", kind: "grade", title: "New grade", at: DAY },
    ]);
    // Mark all read leaves the one the LMS wants confirmed.
    expect(await markAllRead(userId)).toEqual({ count: 2, lms: 1 });
    expect(lms.markNotificationRead).toHaveBeenCalledWith({ token: "t" }, "56");
    expect(lms.acknowledgeNotification).not.toHaveBeenCalled();
    expect((await feed(userId)).find((i) => i.id === "lms:55")?.read).toBe(false);
    // Opening it reads and acknowledges it, here and in the LMS: no Got it.
    expect(await readNotification(userId, "lms:55")).toEqual({ lms: 1 });
    expect(lms.markNotificationRead).toHaveBeenCalledWith({ token: "t" }, "55");
    expect(lms.acknowledgeNotification).toHaveBeenCalledWith({ token: "t" }, "55");
    expect((await feed(userId)).every((i) => i.read)).toBe(true);
    // The screen says "Acknowledged"; reopening never calls the LMS again.
    const v = await views.notifications(userId);
    expect(v!.sections.flatMap((s) => s.items).find((i) => i.id === "lms:55")).toMatchObject({ read: true, needsAck: false, acknowledged: true });
    lms.acknowledgeNotification.mockClear();
    expect(await acknowledge(userId, "lms:55")).toEqual({ lms: 0 });
    expect(lms.acknowledgeNotification).not.toHaveBeenCalled();
  });

  it("a notification opened from a link shows as read and acknowledged at once", async () => {
    await db().insert(feedItems).values({ userId, id: "lms:58", kind: "announcement", title: "Confirm", at: DAY, needsAck: true });
    const v = await views.notifications(userId, { open: "lms:58" });
    expect(v!.open).toMatchObject({ read: true, needsAck: false, acknowledged: true });
    expect(v!.unread).toBe(0);
  });

  it("keeps the local read when the LMS fails", async () => {
    await db().insert(feedItems).values({ userId, id: "lms:57", kind: "announcement", title: "x", at: DAY });
    lms.markNotificationRead.mockRejectedValue(new Error("LMS 500"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readNotification(userId, "lms:57")).toEqual({ lms: 0 });
    expect((await feed(userId))[0].read).toBe(true);
  });
});

describe("in-process scheduler", () => {
  it("runs only where it should: never on build or in tests, on in production", () => {
    const base = { DATABASE_URL: "postgres://x" } as unknown as NodeJS.ProcessEnv;
    expect(schedulerEnabled({ ...base, NODE_ENV: "production" })).toBe(true);
    expect(schedulerEnabled({ ...base, NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).toBe(false);
    expect(schedulerEnabled({ ...base, NODE_ENV: "production", SCHEDULER: "off" })).toBe(false);
    expect(schedulerEnabled({ ...base, NODE_ENV: "development" })).toBe(false);
    expect(schedulerEnabled({ ...base, NODE_ENV: "development", SCHEDULER: "on" })).toBe(true);
    expect(schedulerEnabled({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(schedulerEnabled()).toBe(false); // vitest
  });

  it("lets one run hold a job at a time and frees the lock after, even on errors", async () => {
    let release!: () => void;
    const first = withJobLock("test-job", () => new Promise<string>((r) => (release = () => r("done"))));
    await new Promise((r) => setTimeout(r, 50));
    expect(await withJobLock("test-job", async () => "second")).toEqual({ locked: true });
    // Another job is not blocked.
    expect(await withJobLock("other-job", async () => 1)).toEqual({ locked: false, result: 1 });
    release();
    expect(await first).toEqual({ locked: false, result: "done" });
    await expect(withJobLock("test-job", async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(await withJobLock("test-job", async () => "again")).toEqual({ locked: false, result: "again" });
  });

  it("the cron route answers `locked` while the scheduler runs the same job", async () => {
    let release!: () => void;
    const held = withJobLock("reminders", () => new Promise<void>((r) => (release = r)));
    await new Promise((r) => setTimeout(r, 50));
    const res = await remindersCron(new Request("https://x/api/cron/reminders", { method: "POST", headers: { authorization: "Bearer cron-secret" } }));
    expect(await res.json()).toEqual({ locked: true });
    release();
    await held;
  });

  it("the student job delivers new-grade, absence and announcement alerts to the linked chat, by settings and quiet hours", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const students = JOBS.find((j) => j.name === "students")!;
    vi.useFakeTimers({ toFake: ["Date"], now: DAY });
    try {
      await runJob(students);
      expect(sentTitles()).toEqual(["LMS · Quiz 6 opens tomorrow at 09:00"]);
      expect(tg.send.mock.calls.every((c) => c[0] === "111")).toBe(true);
      expect(log.mock.calls.at(-1)?.[0]).toMatch(/^\[scheduler\] students \d+ms processed=1 ok=1/);

      // Grades off: absences and announcements still come; grades don't.
      tg.send.mockClear();
      await setAlerts(userId, { grade: false });
      lmsReturns({
        notes: [{ id: 60, title: "Midterm room list", publicate_at: unix("2026-11-02T11:00:00+05:00"), read: 0 }],
        gradebook: gradebook({ admit: { absence_count_all: 10, avaibale_count_all: 5, lessons_count: 60 }, events: [{ lesson_name: "Lecture 14", lesson_type: 0, status: 3, time: unix("2026-10-26T10:00:00+05:00") }, { lesson_name: "Quiz 6", lesson_type: 1, status: 1, time: unix("2026-11-01T10:00:00+05:00"), mark: 9 }] }),
      });
      vi.setSystemTime(new Date(DAY.getTime() + 30 * 60_000));
      await runJob(students);
      expect(sentTitles().sort()).toEqual(["LMS · Midterm room list", "Marked absent in Calculus 1"]);

      // 23:30 Tashkent: a new announcement waits for the morning.
      tg.send.mockClear();
      lms.notifications.mockResolvedValue({ all: [{ id: 61, title: "Late news", publicate_at: unix("2026-11-02T23:10:00+05:00"), read: 0 }] });
      vi.setSystemTime(at("2026-11-02T18:30:00Z"));
      await runJob(students);
      expect(tg.send).not.toHaveBeenCalled();
      vi.setSystemTime(at("2026-11-03T03:30:00Z")); // 08:30
      await runJob(students);
      expect(sentTitles()).toContain("LMS · Late news");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the reminders job sends to linked students", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await runJob(JOBS.find((j) => j.name === "reminders")!);
    expect(r).toMatchObject({ locked: false, result: { processed: 1 } });
  });
});

void runRemindersBatch;
