import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  adminMarks, auditLog, broadcasts, courseRatings, fileOverrides, lmsCache, lmsCourses, lmsCourseTeachers, lmsFiles, lmsTeachers, mentionLinks, mentions,
  reports, teacherAliases, teacherRatings, uploads, userRoles, users,
} from "@/lib/db/schema";
import { setRole } from "@/server/identity";
import { report } from "@/server/reports";
import { trustFor } from "@/server/uploads";
import { hiddenPosts, postMuted, sessionsRevokedAt, settings } from "@/server/admin/marks";
import * as ops from "@/server/admin/ops";
import { auditPage, audienceSize, chrome, courseFiles, overview, peoplePage, professorsPage, reportsPage, systemPage, uploadsPage } from "@/server/admin/views";
import { resetDb } from "../fixtures/db";

const newUser = async (email: string, extra: Partial<typeof users.$inferInsert> = {}) => (await db().insert(users).values({ email, ...extra }).returning())[0].id;

let admin: string;
let mod: string;
let student: string;
let uploader: string;

const upload = async (over: Partial<typeof uploads.$inferInsert> = {}) =>
  (
    await db()
      .insert(uploads)
      .values({ uploaderId: uploader, courseId: "77", courseCode: "MATH111", title: "Midterm exam, Fall 2025", type: "exam", fileName: "m.pdf", mimeType: "application/pdf", size: 2_400_000, sha256: crypto.randomUUID(), ...over })
      .returning()
  )[0];

beforeEach(async () => {
  await resetDb();
  admin = await newUser("boss@newuu.uz");
  mod = await newUser("mod@newuu.uz");
  student = await newUser("s@newuu.uz");
  uploader = await newUser("u@newuu.uz");
  await setRole(mod, "moderator");
  await db().insert(lmsCourses).values({ id: "77", code: "MATH111", name: "Calculus 1", raw: {} });
  await db().insert(lmsCache).values({ userId: uploader, data: { profile: { name: "Aziz Tursunov", semesters: [{}, {}, {}] }, enrollment: { codes: ["MATH111"] } } });
});

const actions = async () => (await db().select().from(auditLog)).map((a) => a.action);

describe("access control", () => {
  it("refuses students and moderators outside their sections", async () => {
    const u = await upload();
    await expect(ops.publishUpload(student, u.id)).rejects.toBeInstanceOf(ops.Forbidden);
    await expect(ops.publishUpload("", u.id)).rejects.toBeInstanceOf(ops.Forbidden);
    await expect(ops.setTrust(mod, uploader, "trusted")).rejects.toBeInstanceOf(ops.Forbidden);
    await expect(ops.mergeTeachers(mod, "a", "b")).rejects.toBeInstanceOf(ops.Forbidden);
    await expect(ops.scheduleBroadcast(mod, { audience: {}, text: "hi", button: null, bannerUntil: null, sendAt: new Date() })).rejects.toBeInstanceOf(ops.Forbidden);
    await expect(ops.setSetting(mod, "maintenance", true)).rejects.toBeInstanceOf(ops.Forbidden);
    await expect(ops.editFile(mod, { source: "students", id: u.id }, { week: 3 })).rejects.toBeInstanceOf(ops.Forbidden);
    await expect(ops.resolveReport(student, { kind: "post", id: "1" }, "hide")).rejects.toBeInstanceOf(ops.Forbidden);
    expect(await actions()).toEqual([]);
  });
});

describe("uploads review", () => {
  it("publishes with edits, writes the audit and the bot message", async () => {
    const u = await upload();
    const r = await ops.publishUpload(mod, u.id, { week: 8, title: "Midterm, Fall 2025" });
    expect(r.message).toContain("Your file is live");
    const [row] = await db().select().from(uploads).where(eq(uploads.id, u.id));
    expect(row.status).toBe("live");
    expect(row.week).toBe(8);
    expect(row.reviewedBy).toBe(mod);
    expect(await actions()).toEqual(["upload.publish"]);
    await expect(ops.publishUpload(mod, u.id)).rejects.toThrow();
  });
  it("turns an upload down with a numbered reason; Other needs a note", async () => {
    const u = await upload({ title: "Lecture notes weeks 1–4" });
    await expect(ops.rejectUpload(mod, u.id, "other", " ")).rejects.toBeInstanceOf(ops.AdminError);
    const r = await ops.rejectUpload(mod, u.id, "in-lms");
    expect(r.message).toMatch(/^Not accepted: Lecture notes weeks 1–4/);
    expect((await db().select().from(uploads).where(eq(uploads.id, u.id)))[0].rejectReason).toBe("in-lms");
    expect(await actions()).toEqual(["upload.reject"]);
  });
  it("hides a live file on spot check", async () => {
    const u = await upload({ status: "live" });
    await ops.hideLiveUpload(mod, u.id);
    expect((await db().select().from(uploads).where(eq(uploads.id, u.id)))[0].status).toBe("hidden");
  });
  it("builds the queue view with checks, trust and course choices", async () => {
    await upload({ checks: { lms: { match: "Week 1 slides.pdf", score: 0.92 } }, title: "Lecture notes" });
    for (let i = 0; i < 5; i++) await upload({ status: "live", title: `Old ${i}` });
    const v = await uploadsPage("waiting", undefined);
    expect(v.counts).toEqual({ waiting: 1, live: 5, rejected: 0 });
    expect(v.items[0].flag).toBe("lms");
    expect(v.items[0].trust).toBe("trusted");
    expect(v.items[0].uploader).toMatchObject({ label: "Year 2", live: 5, rejected: 0 });
    expect(v.courseOptions.map((c) => c.name)).toEqual(["Calculus 1"]);
    expect((await chrome({ id: admin, email: "boss@newuu.uz" })).counts.uploads).toBe(1);
  });
});

describe("reports", () => {
  beforeEach(async () => {
    await db().insert(mentions).values({ postId: 42, url: "https://t.me/c/42", text: "He gives zero for late by 1 min, total clown" });
    await db().insert(mentionLinks).values({ postId: 42, kind: "course", target: "MATH111" });
    await report(student, { kind: "post", id: "42" }, "insult");
    await report(uploader, { kind: "post", id: "42" }, "untrue");
  });
  it("shows content and counts, never reporters or authors", async () => {
    const v = await reportsPage("open", undefined);
    expect(v.items).toHaveLength(1);
    expect(v.items[0]).toMatchObject({ kind: "post", body: "He gives zero for late by 1 min, total clown", rule: expect.stringContaining("Rule:") });
    const json = JSON.stringify(v);
    for (const id of [student, uploader]) expect(json).not.toContain(id);
  });
  it("hides and mutes through the post only, and audits", async () => {
    await ops.resolveReport(mod, { kind: "post", id: "42" }, "mute");
    expect((await hiddenPosts()).has("42")).toBe(true);
    expect(await postMuted("42")).toBe(true);
    expect((await db().select().from(reports)).every((r) => r.status === "hidden")).toBe(true);
    expect(await actions()).toEqual(expect.arrayContaining(["report.hidden", "post.mute"]));
    const marks = await db().select().from(adminMarks);
    expect(JSON.stringify(marks)).not.toContain(student);
  });
  it("refuses to mute a file's uploader and hides a reported live file", async () => {
    const u = await upload({ status: "live" });
    await report(student, { kind: "file", id: u.id }, "exam-running");
    await expect(ops.resolveReport(mod, { kind: "file", id: u.id }, "mute")).rejects.toBeInstanceOf(ops.AdminError);
    await ops.resolveReport(mod, { kind: "file", id: u.id }, "hide");
    expect((await db().select().from(uploads).where(eq(uploads.id, u.id)))[0].status).toBe("hidden");
  });
  it("keeps", async () => {
    await ops.resolveReport(mod, { kind: "post", id: "42" }, "keep");
    expect((await reportsPage("open", undefined)).items).toHaveLength(0);
    expect((await reportsPage("resolved", undefined)).counts.resolved).toBe(1);
  });
});

describe("courses & files", () => {
  beforeEach(async () => {
    await db().insert(lmsFiles).values([
      { id: "f1", courseId: "77", code: "MATH111", name: "MATH111 Week 2 Limits lecture.pdf", storageKey: "k1" },
      { id: "f2", courseId: "77", code: "MATH111", name: "Week 4 Derivatives.pdf", storageKey: "k2" },
    ]);
  });
  it("renames LMS files through overrides and moves / hides in bulk", async () => {
    const s = await upload({ status: "live", week: 7 });
    await ops.editFile(admin, { source: "lms", id: "f1" }, { title: "Limits and continuity — lecture", type: "lecture" });
    await ops.bulkFiles(admin, [{ source: "lms", id: "f1" }, { source: "students", id: s.id }], { week: 3 });
    await ops.bulkFiles(admin, [{ source: "lms", id: "f2" }], { hidden: true });
    const [o] = await db().select().from(fileOverrides).where(eq(fileOverrides.fileId, "f1"));
    expect(o).toMatchObject({ title: "Limits and continuity — lecture", type: "lecture", week: 3, hidden: false });
    expect((await db().select().from(uploads).where(eq(uploads.id, s.id)))[0].week).toBe(3);
    const v = await courseFiles("MATH111");
    expect(v?.counts).toEqual({ all: 2, lms: 1, students: 1, hidden: 1 });
    expect(v?.files.find((f) => f.id === "f1")?.title).toBe("Limits and continuity — lecture");
    expect(v?.files.find((f) => f.source === "students")?.from).toBe("From students");
    expect(await actions()).toEqual(expect.arrayContaining(["file.edit", "file.move", "file.hide"]));
  });
});

describe("professors", () => {
  it("finds twins and merges without double votes", async () => {
    await db().insert(lmsTeachers).values([
      { id: "4512", firstName: "Gonçalo", lastName: "Pinto" },
      { id: "9001", firstName: "Goncalo", lastName: "Pinto" },
    ]);
    await db().insert(lmsCourseTeachers).values([{ courseId: "77", teacherId: "4512", role: "Lecture" }, { courseId: "77", teacherId: "9001", role: "Lecture" }]);
    const rate = async (rater: string, teacherId: string, at: Date) => {
      const [r] = await db().insert(courseRatings).values({ rater, courseId: "77", term: `T${teacherId}`, recommend: "yes", updatedAt: at }).returning();
      await db().insert(teacherRatings).values({ ratingId: r.id, teacherId, role: "lecture" });
    };
    await rate("r1", "4512", new Date("2025-01-01"));
    await rate("r1", "9001", new Date("2025-06-01"));
    await rate("r2", "4512", new Date("2025-01-01"));
    const v = await professorsPage("duplicates", undefined);
    expect(v.duplicates).toHaveLength(1);
    expect(v.selected?.after).toMatchObject({ ratings: 2, doubles: 1 });
    const { doubles } = await ops.mergeTeachers(admin, "4512", "9001");
    expect(doubles).toBe(1);
    expect((await db().select().from(teacherRatings)).map((t) => t.teacherId).sort()).toEqual(["4512", "4512"]);
    expect(await db().select().from(teacherAliases)).toEqual([{ oldId: "9001", teacherId: "4512" }]);
    expect((await db().select().from(lmsCourseTeachers)).map((r) => r.teacherId)).toEqual(["4512"]);
    expect((await professorsPage("duplicates", undefined)).duplicates).toHaveLength(0);
  });
  it("remembers 'not the same person'", async () => {
    await db().insert(lmsTeachers).values([{ id: "1", firstName: "Emily", lastName: "Carter" }, { id: "2", firstName: "E.", lastName: "Carter" }]);
    await ops.markNotTwins(admin, "2", "1");
    expect((await professorsPage("duplicates", undefined)).duplicates).toHaveLength(0);
  });
});

describe("people", () => {
  it("sets trust, role and sign-out, and shows only counts for ratings", async () => {
    await ops.setTrust(admin, uploader, "paused");
    expect(await trustFor(uploader)).toBe("paused");
    await ops.setPersonRole(admin, student, "moderator");
    expect((await db().select().from(userRoles).where(eq(userRoles.userId, student)))[0].role).toBe("moderator");
    await expect(ops.setPersonRole(admin, admin, "student")).rejects.toBeInstanceOf(ops.AdminError);
    await ops.signOutEverywhere(admin, uploader);
    expect(await sessionsRevokedAt(uploader)).toBeInstanceOf(Date);
    await expect(ops.messageInBot(admin, uploader, "hi")).rejects.toThrow(/linked the bot/);
    const v = await peoplePage("aziz", undefined);
    expect(v.people.map((p) => p.name)).toEqual(["Aziz Tursunov"]);
    expect(v.detail).toMatchObject({ trust: "paused", ratings: "0 given (content private)" });
    expect(JSON.stringify(v)).not.toMatch(/sealed|password/i);
    const log = await auditPage({});
    expect(log.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["Trust changed", "Role changed", "Signed out everywhere", "Messaged in bot"]));
  });
});

describe("broadcasts", () => {
  it("schedules outside quiet hours and once per day per student", async () => {
    const now = new Date("2026-11-03T10:00:00+05:00");
    const row = await ops.scheduleBroadcast(admin, { audience: { years: [1, 2] }, text: "Registration opens tomorrow", button: { label: "Plan next semester", target: "/next" }, bannerUntil: null, sendAt: new Date("2026-11-03T23:00:00+05:00") }, now);
    expect(row.sendAt).toEqual(new Date("2026-11-04T07:00:00+05:00"));
    await expect(ops.scheduleBroadcast(admin, { audience: {}, text: "Again", button: null, bannerUntil: null, sendAt: new Date("2026-11-04T19:00:00+05:00") }, now)).rejects.toBeInstanceOf(ops.AdminError);
    await ops.scheduleBroadcast(admin, { audience: { years: [3] }, text: "Year 3 only", button: null, bannerUntil: null, sendAt: new Date("2026-11-04T19:00:00+05:00") }, now);
    expect(await db().select().from(broadcasts)).toHaveLength(2);
    await expect(ops.scheduleBroadcast(admin, { audience: {}, text: "x", button: { label: "Go", target: "https://evil.example" }, bannerUntil: null, sendAt: now }, now)).rejects.toThrow();
  });
  it("counts the audience without naming anyone", async () => {
    await db().update(users).set({ telegramId: "555" }).where(eq(users.id, uploader));
    expect(await audienceSize({})).toEqual({ students: 4, reachable: 1 });
    expect(await audienceSize({ years: [2] })).toEqual({ students: 1, reachable: 1 });
    expect(await audienceSize({ courseIds: ["MATH111"] })).toEqual({ students: 1, reachable: 1 });
  });
});

describe("system and overview", () => {
  it("toggles settings with an audit trail and builds the pages", async () => {
    await ops.setSetting(admin, "maintenance", true);
    expect((await settings()).maintenance).toBe(true);
    await ops.setSetting(admin, "maintenance", false);
    expect((await settings()).maintenance).toBe(false);
    let triggered = "";
    await ops.runJob(admin, "harvest", async (j) => void (triggered = j));
    expect(triggered).toBe("harvest");
    await expect(ops.runJob(admin, "rm -rf" as ops.Job, async () => {})).rejects.toThrow();
    expect(await actions()).toEqual(expect.arrayContaining(["setting.on", "setting.off", "job.run"]));
    const sys = await systemPage();
    expect(sys.jobs.length).toBeGreaterThan(3);
    await upload();
    const o = await overview(new Date());
    expect(o.kpis.uploads.value).toBe("1");
    expect(o.rows[0]).toMatchObject({ kind: "upload", title: "Midterm exam, Fall 2025" });
  });
});
