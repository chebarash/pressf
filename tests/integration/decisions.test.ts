import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => ({ scheduleRefresh: vi.fn() }));
vi.mock("@/server/sync/refresh", () => refresh);

import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { broadcasts, courseRatings, lmsCache, mentionLinks, mentions, uploads, userState, users } from "@/lib/db/schema";
import * as ops from "@/server/admin/ops";
import { shellBanner, MAINTENANCE_TEXT } from "@/server/broadcasts";
import { fileOverride, telegramLoginBlocked } from "@/server/decisions";
import { fileOg } from "@/server/og";
import { pseudonym } from "@/server/identity";
import { runSyncBatch } from "@/server/sync/batch";
import { DAY_KEY, runBroadcasts } from "@/server/sync/broadcasts";
import { syncStudent } from "@/server/sync/student";
import { uploadChecks } from "@/server/upload-checks";
import { submitUpload } from "@/server/uploads";
import * as views from "@/server/views";
import { resetDb } from "../fixtures/db";
import { NOW, seedStudent } from "../fixtures/student";

let userId: string;
let admin: string;

beforeEach(async () => {
  await resetDb();
  refresh.scheduleRefresh.mockReset();
  userId = await seedStudent({ telegramId: "700" });
  admin = (await db().insert(users).values({ email: "boss@newuu.uz" }).returning())[0].id;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Jwt = NonNullable<NonNullable<typeof authOptions.callbacks>["jwt"]>;
const jwt = (args: Partial<Parameters<Jwt>[0]>) => authOptions.callbacks!.jwt!({ token: {}, account: null, ...args } as Parameters<Jwt>[0]);

function initData(id: number) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id }) });
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update("tg-token").digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}
type Authorize = (c: Record<string, string>, r: unknown) => Promise<unknown>;
type Configured = { options: { id: string; authorize: Authorize } };
const provider = (id: string) => (authOptions.providers as unknown as Configured[]).find((p) => p.options.id === id)!.options.authorize;

describe("sign out everywhere", () => {
  it("voids sessions issued before it, keeps later ones", async () => {
    const before = await jwt({ token: { sub: userId }, user: { id: userId, email: "s@newuu.uz" } });
    expect(before.issued).toBeTypeOf("number");
    expect(await jwt({ token: before })).toMatchObject({ sub: userId });
    await new Promise((r) => setTimeout(r, 5));
    await ops.signOutEverywhere(admin, userId);
    await expect(jwt({ token: before })).rejects.toThrow("Session revoked");
    // Tokens from before this change carry no `issued`: also void.
    await expect(jwt({ token: { sub: userId } })).rejects.toThrow("Session revoked");
    await new Promise((r) => setTimeout(r, 5));
    const after = await jwt({ token: { sub: userId }, user: { id: userId, email: "s@newuu.uz" } });
    expect(await jwt({ token: after })).toMatchObject({ sub: userId });
    // Other students are untouched.
    expect(await jwt({ token: { sub: admin } })).toMatchObject({ sub: admin });
  });

  it("stops the silent Telegram sign-in until the password is proven again", async () => {
    const telegram = provider("telegram");
    expect(await telegram({ initData: initData(700) }, {})).toMatchObject({ id: userId });
    await ops.signOutEverywhere(admin, userId);
    expect(await telegramLoginBlocked(userId)).toBe(true);
    expect(await telegram({ initData: initData(700) }, {})).toBeNull();
    // A new LMS sign-in (or the desktop hand-off) relinks it.
    const { markRelinked } = await import("@/server/decisions");
    await markRelinked(userId);
    expect(await telegram({ initData: initData(700) }, {})).toMatchObject({ id: userId });
    // A second sign-out blocks it again.
    await ops.signOutEverywhere(admin, userId);
    expect(await telegram({ initData: initData(700) }, {})).toBeNull();
  });
});

describe("maintenance and broadcast banner", () => {
  it("shows the maintenance notice to everyone while it is on", async () => {
    expect(await shellBanner(userId, NOW)).toBeNull();
    await ops.setSetting(admin, "maintenance", true);
    expect(await shellBanner(null, NOW)).toEqual({ id: "maintenance", tone: "warning", text: MAINTENANCE_TEXT, action: null });
    await ops.setSetting(admin, "maintenance", false);
    expect(await shellBanner(userId, NOW)).toBeNull();
  });

  it("shows a broadcast banner to its audience until bannerUntil", async () => {
    await db().insert(broadcasts).values({
      audience: { courseIds: ["MATH111"] }, text: "Rate your courses", button: { label: "Rate", target: "/rate" },
      bannerUntil: new Date(NOW.getTime() + 86_400_000), sendAt: new Date(NOW.getTime() - 60_000),
    });
    expect(await shellBanner(userId, NOW)).toMatchObject({ tone: "info", text: "Rate your courses", action: { label: "Rate", href: "/rate" } });
    expect(await shellBanner(admin, NOW)).toBeNull(); // not taking MATH111
    expect(await shellBanner(userId, new Date(NOW.getTime() + 2 * 86_400_000))).toBeNull();
  });
});

describe("sync pause", () => {
  it("makes no LMS calls while paused", async () => {
    const fetch = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetch);
    await ops.setSetting(admin, "sync-paused", true);
    expect(await runSyncBatch({ pauseMs: 0, minAgeMs: 0 })).toMatchObject({ processed: 0, paused: true });
    expect(await syncStudent(userId, NOW)).toMatchObject({ ok: true, skipped: "paused" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("hidden and muted Anonymous posts", () => {
  it("drops them from course and professor pages", async () => {
    await db().insert(mentions).values([{ postId: 1, url: "https://t.me/a/1", text: "Calc is fine" }, { postId: 2, url: "https://t.me/a/2", text: "Calc is bad" }, { postId: 3, url: "https://t.me/a/3", text: "Pinto rocks" }]);
    await db().insert(mentionLinks).values([{ postId: 1, kind: "course", target: "MATH111" }, { postId: 2, kind: "course", target: "MATH111" }, { postId: 3, kind: "teacher", target: "T1" }, { postId: 2, kind: "teacher", target: "T1" }]);
    await ops.resolveReport(admin, { kind: "post", id: "2" }, "hide");
    await ops.resolveReport(admin, { kind: "post", id: "3" }, "mute");
    const c = (await views.course("MATH111", null, null, NOW))!;
    expect(c.anonymous).toMatchObject({ count: 1, latest: [{ id: 1 }] });
    const p = (await views.professor("T1", null))!;
    expect(p.anonymous).toMatchObject({ count: 0, latest: [] });
  });
});

describe("LMS file edits", () => {
  it("rename, retype and move show everywhere; hidden files disappear", async () => {
    await ops.editFile(admin, { source: "lms", id: "F1" }, { title: "Review before the midterm", type: "lecture", week: 7 });
    const c = (await views.course("MATH111", null, { userId }, NOW))!;
    expect(c.files!.items.find((f) => f.id === "F1")).toMatchObject({ title: "Review before the midterm", type: "lecture", typeLabel: "Lecture", week: 7 });
    expect((await views.file("F1", { userId }))).toMatchObject({ title: "Review before the midterm", type: "lecture", week: 7 });
    expect((await views.today(userId, NOW))!.materials[0]).toMatchObject({ title: "Review before the midterm" });
    expect((await views.timetable(userId, "2026-11-02", NOW))!.classes[0].materials[0]).toMatchObject({ title: "Review before the midterm" });
    expect((await views.search("before the", { userId })).files[0]).toMatchObject({ id: "F1", title: "Review before the midterm" });
    expect(await fileOg("F1")).toMatchObject({ title: "Review before the midterm", type: "lecture", week: 7 });

    await ops.bulkFiles(admin, [{ source: "lms", id: "F1" }], { hidden: true });
    expect((await fileOverride("F1"))?.hidden).toBe(true);
    expect((await views.course("MATH111", null, { userId }, NOW))!.files!.items.map((f) => f.id)).not.toContain("F1");
    expect(await views.file("F1", { userId })).toBeNull();
    expect((await views.today(userId, NOW))!.materials).toEqual([]);
    expect((await views.timetable(userId, "2026-11-02", NOW))!.classes[0].materials).toEqual([]);
    expect((await views.search("midterm", { userId })).files).toEqual([]);
    expect(await fileOg("F1")).toBeNull();
  });
});

describe("broadcast delivery", () => {
  let sent: Array<{ chat_id: string; text: string; reply_markup?: { inline_keyboard: Array<Array<{ text: string }>> } }>;
  beforeEach(() => {
    sent = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true, result: { message_id: 1, chat: { id: 1, type: "private" } } });
    }));
  });
  const day = new Date("2026-11-02T07:00:00Z"); // 12:00 Tashkent

  it("sends due broadcasts to the audience once, with stats", async () => {
    const other = (await db().insert(users).values({ email: "o@newuu.uz", telegramId: "800" }).returning())[0].id;
    await db().insert(lmsCache).values({ userId: other, data: { enrollment: { codes: ["PHYS101"] } } });
    const [b] = await db().insert(broadcasts).values({ audience: { courseIds: ["MATH111"] }, text: "Midterm <b>tips</b>", button: { label: "Open", target: "/c/MATH111" }, sendAt: new Date(day.getTime() - 60_000) }).returning();
    await db().insert(broadcasts).values({ audience: {}, text: "Later", button: null, sendAt: new Date(day.getTime() + 3600_000) });

    expect(await runBroadcasts({ now: day, pauseMs: 0 })).toMatchObject({ broadcasts: 1, sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ chat_id: "700", text: "Midterm &lt;b&gt;tips&lt;/b&gt;" });
    expect(sent[0].reply_markup!.inline_keyboard[0][0].text).toBe("Open");
    const [row] = await db().select().from(broadcasts).where(eq(broadcasts.id, b.id));
    expect(row.sentAt).not.toBeNull();
    expect(row.stats).toMatchObject({ targeted: 1, delivered: 1 });
    // Already sent: nothing more.
    expect(await runBroadcasts({ now: day, pauseMs: 0 })).toMatchObject({ broadcasts: 0, sent: 0 });
    void other;
  });

  it("waits out quiet hours and keeps to one broadcast per student per day", async () => {
    await db().insert(broadcasts).values({ audience: {}, text: "First", button: null, sendAt: new Date("2026-11-01T18:00:00Z") });
    expect(await runBroadcasts({ now: new Date("2026-11-01T18:30:00Z"), pauseMs: 0 })).toMatchObject({ held: true, sent: 0 }); // 23:30
    expect(await runBroadcasts({ now: day, pauseMs: 0 })).toMatchObject({ sent: 1 });
    const [state] = await db().select().from(userState).where(eq(userState.userId, userId));
    expect(state.snapshot[DAY_KEY]).toBe("2026-11-02");
    await db().insert(broadcasts).values({ audience: {}, text: "Second", button: null, sendAt: day });
    expect(await runBroadcasts({ now: new Date(day.getTime() + 60_000), pauseMs: 0 })).toMatchObject({ broadcasts: 1, sent: 0 });
    const [second] = await db().select().from(broadcasts).where(eq(broadcasts.text, "Second"));
    expect(second.stats).toMatchObject({ targeted: 1, delivered: 0, skipped: 1 });
    expect(sent.map((s) => s.text)).toEqual(["First"]);
  });

  it("leaves out students who rated when the audience is 'haven't rated'", async () => {
    await db().insert(courseRatings).values({ rater: pseudonym(userId, "rater"), courseId: "101", term: "Fall 2025", recommend: "yes" });
    await db().insert(broadcasts).values({ audience: { unrated: "Fall 2025" }, text: "Rate", button: null, sendAt: day });
    expect(await runBroadcasts({ now: new Date(day.getTime() + 1000), pauseMs: 0 })).toMatchObject({ sent: 0 });
    expect(sent).toEqual([]);
  });

  it("resumes a big audience on the next run", async () => {
    await db().insert(users).values([{ email: "a@newuu.uz", telegramId: "801" }, { email: "b@newuu.uz", telegramId: "802" }]);
    await db().insert(broadcasts).values({ audience: {}, text: "All", button: null, sendAt: day });
    const at = new Date(day.getTime() + 1000);
    expect(await runBroadcasts({ now: at, pauseMs: 0, budgetMs: -1 })).toMatchObject({ sent: 0 }); // out of time before the first
    const first = await runBroadcasts({ now: new Date(at.getTime() + 100_000), pauseMs: 0 });
    expect(first.sent).toBe(3);
    const [row] = await db().select().from(broadcasts);
    expect(row.stats).toMatchObject({ targeted: 3, delivered: 3 });
    expect(row.sentAt).not.toBeNull();
  });
});

async function pdfWith(text: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage().drawText(text, { x: 40, y: 700, size: 12, font });
  return new Uint8Array(await doc.save());
}

describe("upload checks", () => {
  it("finds a similar LMS file, a copy and personal data", async () => {
    const [other] = await db().insert(uploads).values({ uploaderId: userId, courseId: "102", courseCode: "PHYS101", title: "Notes", type: "notes", fileName: "n.pdf", mimeType: "application/pdf", size: 10, sha256: "same" }).returning();
    const bytes = await pdfWith("Call me +998 90 123 45 67 or mail aziz@gmail.com");
    const checks = await uploadChecks({ courseId: "101", courseCode: "MATH111", courseName: "Calculus 1", fileName: "Week 8 Midterm review slides.pdf", size: 1000, sha256: "same", type: "notes", bytes }, NOW);
    expect(checks.lms).toMatchObject({ match: "Midterm review slides" });
    expect(checks.lms!.score).toBeGreaterThanOrEqual(0.95);
    expect(checks.duplicate).toBe(`${other.title} · PHYS101`);
    expect(checks.personal).toEqual(["phone numbers", "emails"]);
    expect(checks.exam).toBeUndefined();

    const clean = await uploadChecks({ courseId: "101", courseCode: "MATH111", fileName: "my handwritten notes.pdf", size: 5, sha256: "new", type: "notes", bytes: await pdfWith("Limits and derivatives") }, NOW);
    expect(clean).toMatchObject({ lms: { match: null, score: null }, duplicate: false, personal: [] });
  });

  it("flags an exam that is running or just ended, from the calendar", async () => {
    const midterm = (now: string) => uploadChecks({ courseId: "101", courseCode: "MATH111", fileName: "mid.jpg", size: 5, sha256: crypto.randomUUID(), type: "exam", exam: "midterm", term: "Fall 2026" }, new Date(now));
    const past = await uploadChecks({ courseId: "101", courseCode: "MATH111", fileName: "old.jpg", size: 5, sha256: "x", type: "exam", exam: "final", term: "Fall 2025" }, NOW);
    expect(past.exam).toEqual({ date: null, running: false });
    expect((await midterm("2026-12-25T06:00:00Z")).exam).toMatchObject({ running: false });
    const during = await midterm("2026-11-02T06:00:00Z");
    expect(during.exam).toMatchObject({ date: "2 Nov", running: true });
    expect((await midterm("2026-11-08T06:00:00Z")).exam).toMatchObject({ running: true }); // ended 2 days ago
  });

  it("holds a flagged upload from a trusted student for review", async () => {
    const base = { uploaderId: userId, courseId: "101", courseCode: "MATH111", title: "t", type: "notes", fileName: "a.pdf", mimeType: "application/pdf", size: 1 };
    const { userRoles } = await import("@/lib/db/schema");
    await db().insert(userRoles).values({ userId, manualTrust: "trusted" });
    expect(await submitUpload({ ...base, sha256: "a" }, 0.5)).toMatchObject({ status: "live" });
    expect(await submitUpload({ ...base, sha256: "b" }, 0.5, { hold: true })).toMatchObject({ status: "waiting" });
  });
});
