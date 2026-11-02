import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { RatingInput } from "@/core/ratings";
import { db } from "@/lib/db";
import { courseRatings, teacherRatings, users } from "@/lib/db/schema";
import { recentAudit } from "@/server/audit";
import { alertSettings, feed, ingest, markRead, saveSnapshot, setAlerts, snapshot } from "@/server/feed";
import { pseudonym, roleOf, setRole } from "@/server/identity";
import { issueLink, linkUsed, redeemLink } from "@/server/link";
import { askFor, courseSummary, dismissAsk, myRatings, ratedKeys, RatingError, saveRating, teacherSummary } from "@/server/ratings";
import { openReports, report, resolve } from "@/server/reports";
import { liveFor, publish, queue, reject, submitUpload, trustFor, UploadRefused, type NewUpload } from "@/server/uploads";
import { resetDb } from "../fixtures/db";

const newUser = async (email: string) => (await db().insert(users).values({ email }).returning())[0].id;

let student: string;
let mod: string;

beforeEach(async () => {
  await resetDb();
  student = await newUser("s@newuu.uz");
  mod = await newUser("m@newuu.uz");
});

const rating = (over: Partial<RatingInput> = {}): RatingInput => ({
  recommend: "yes", hours: "4-6", difficulty: 3, tags: ["Useful later"],
  teachers: [{ teacherId: "t1", role: "lecture", pressF: true, tags: ["Explains clearly"] }], ...over,
});

describe("identity", () => {
  it("gives stable pseudonyms that are not the user id", () => {
    expect(pseudonym(student, "rater")).toBe(pseudonym(student, "rater"));
    expect(pseudonym(student, "rater")).not.toContain(student);
    expect(pseudonym(student, "rater")).not.toBe(pseudonym(student, "reporter"));
  });
  it("resolves roles, admins by email first", async () => {
    expect(await roleOf(student)).toBe("student");
    await setRole(mod, "moderator");
    expect(await roleOf(mod)).toBe("moderator");
    expect(await roleOf(await newUser("boss@newuu.uz"))).toBe("admin");
    expect(await roleOf("00000000-0000-0000-0000-000000000000")).toBe("guest");
  });
});

describe("ratings", () => {
  it("stores one rating per course and term without the user id", async () => {
    await saveRating(student, { id: "77", code: "MATH111" }, "Fall 2025", rating());
    await saveRating(student, { id: "77", code: "MATH111" }, "Fall 2025", rating({ recommend: "no", teachers: [] }));
    const rows = await db().select().from(courseRatings);
    expect(rows).toHaveLength(1);
    expect(rows[0].recommend).toBe("no");
    expect(JSON.stringify(rows[0])).not.toContain(student);
    expect(await db().select().from(teacherRatings)).toHaveLength(0);
    expect(await ratedKeys(student)).toEqual(new Set(["77|Fall 2025"]));
    expect((await myRatings(student))[0].recommend).toBe("no");
  });
  it("rejects a rating without the required answer", async () => {
    await expect(saveRating(student, { id: "77" }, "Fall 2025", rating({ recommend: null }))).rejects.toBeInstanceOf(RatingError);
  });
  it("summarizes from five students", async () => {
    for (let i = 0; i < 4; i++) await saveRating(await newUser(`r${i}@newuu.uz`), { id: "77" }, "Fall 2025", rating({ recommend: i < 3 ? "yes" : "no" }));
    expect(await courseSummary("77")).toEqual({ enough: false, count: 4 });
    await saveRating(student, { id: "77" }, "Fall 2025", rating());
    const s = await courseSummary("77");
    expect(s).toMatchObject({ enough: true, count: 5, recommendPct: 80, hours: 5, difficulty: 3 });
    expect(await teacherSummary("t1")).toMatchObject({ enough: true, pressFPct: 100 });
  });
  it("gets louder after dismissals", async () => {
    expect(await askFor(student, "Fall 2025", 2, 0)).toBe("card");
    await dismissAsk(student, "Fall 2025");
    expect(await askFor(student, "Fall 2025", 2, 0)).toBe("banner");
    await dismissAsk(student, "Fall 2025");
    await dismissAsk(student, "Fall 2025");
    expect(await askFor(student, "Fall 2025", 2, 0)).toBe("shine");
  });
});

describe("uploads", () => {
  const file = (sha: string, over: Partial<NewUpload> = {}): NewUpload => ({
    uploaderId: student, courseId: "77", courseCode: "MATH111", title: "Midterm exam, Fall 2025", type: "exam", exam: "midterm", term: "Fall 2025",
    fileName: "m.pdf", mimeType: "application/pdf", size: 1000, sha256: sha, ...over,
  });
  it("queues, publishes and rejects with audit and bot messages", async () => {
    const a = await submitUpload(file("a"));
    const b = await submitUpload(file("b", { title: "Notes" }));
    expect(a).toMatchObject({ duplicate: false, status: "waiting" });
    expect(await submitUpload(file("a"))).toEqual({ duplicate: true });
    expect(await queue()).toHaveLength(2);
    if (a.duplicate || b.duplicate) throw new Error("unexpected duplicate");
    const pub = await publish(a.upload.id, mod, { week: 8 }, "Calculus 1");
    expect(pub.upload).toMatchObject({ status: "live", week: 8 });
    expect(pub.message).toMatch(/Midterm exam, Fall 2025 · Calculus 1/);
    const rej = await reject(b.upload.id, mod, "in-lms", "", "Calculus 1");
    expect(rej.message).toMatch(/^Not accepted: Notes · Calculus 1/);
    await expect(publish(a.upload.id, mod)).rejects.toThrow(/Cannot move/);
    expect((await liveFor("77")).map((u) => u.title)).toEqual(["Midterm exam, Fall 2025"]);
    expect((await recentAudit()).map((r) => r.action).sort()).toEqual(["upload.publish", "upload.reject"]);
  });
  it("trusts after five live uploads and respects a pause", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await submitUpload(file(`s${i}`));
      if (!r.duplicate) await publish(r.upload.id, mod);
    }
    expect(await trustFor(student)).toBe("trusted");
    expect(await submitUpload(file("t1"), 0.5)).toMatchObject({ status: "live" });
    await db().execute(sql`insert into user_roles (user_id, role, manual_trust) values (${student}, 'student', 'paused')`);
    await expect(submitUpload(file("t2"))).rejects.toBeInstanceOf(UploadRefused);
  });
});

describe("feed", () => {
  const item = (id: string, at: string) => ({ id, kind: "grade" as const, title: id, at: new Date(at), read: false });
  it("returns only new items and tracks reads", async () => {
    expect(await ingest(student, [item("a", "2026-11-01"), item("b", "2026-11-02")])).toHaveLength(2);
    expect((await ingest(student, [item("a", "2026-11-01"), item("c", "2026-11-03")])).map((i) => i.id)).toEqual(["c"]);
    await markRead(student, ["a"]);
    const list = await feed(student);
    expect(list.map((i) => [i.id, i.read])).toEqual([["c", false], ["b", false], ["a", true]]);
  });
  it("keeps alert settings and snapshots", async () => {
    expect((await alertSettings(student)).file).toBe(false);
    await setAlerts(student, { file: true });
    expect((await alertSettings(student)).file).toBe(true);
    await saveSnapshot(student, "grades", { "77": 86 });
    expect(await snapshot(student, "grades")).toEqual({ "77": 86 });
    expect((await alertSettings(student)).file).toBe(true);
  });
});

describe("link tokens", () => {
  it("redeems once and expires", async () => {
    const token = await issueLink(student);
    expect(await linkUsed(token)).toBe(false);
    expect(await redeemLink(token)).toBe(student);
    expect(await redeemLink(token)).toBeNull();
    expect(await linkUsed(token)).toBe(true);
    const old = await issueLink(student);
    expect(await redeemLink(old, new Date(Date.now() + 11 * 60_000))).toBeNull();
    expect(await redeemLink("nope")).toBeNull();
  });
});

describe("reports", () => {
  it("counts reports per item once per student and resolves them", async () => {
    await report(student, { kind: "post", id: "123" }, "insult");
    await report(student, { kind: "post", id: "123" }, "insult");
    await report(mod, { kind: "post", id: "123" }, "not-true");
    const open = await openReports();
    expect(open).toEqual([{ kind: "post", id: "123", total: 2, reasons: { insult: 1, "not-true": 1 } }]);
    await resolve({ kind: "post", id: "123" }, "hidden", mod);
    expect(await openReports()).toEqual([]);
  });
});
