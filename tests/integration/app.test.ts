import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({ current: null as null | { id: string; email: string; group: string | null; isAdmin: boolean } }));
const jar = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  getUser: async () => user.current,
  requireAdmin: async () => { if (!user.current?.isAdmin) throw new Error("Not allowed"); return user.current; },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => (jar.values.has(k) ? { value: jar.values.get(k) } : undefined), delete: (k: string) => jar.values.delete(k), set: (k: string, v: string) => jar.values.set(k, v) }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/storage", () => ({ signedUrl: async () => "https://files.test/signed" }));

import { POST as cron } from "@/app/api/cron/sync/route";
import { GET as openFile } from "@/app/files/[id]/route";
import { GET as health } from "@/app/api/health/route";
import { GET as search, POST as track } from "@/app/api/search/route";
import { chooseGroup, deleteRating, payRespect, rateTeacher, removeGroup, saveOverride } from "@/lib/actions";
import { getCatalog } from "@/lib/catalog";
import { authOptions } from "@/lib/auth";
import type { Teacher } from "@/lib/catalog";
import { channelPosts, courseDetails, mentionsFor, popularCourses, programsWith, publishedFiles, resolveRequirement, teacherLine, unlocks } from "@/lib/content";
import { db } from "@/lib/db";
import { materials, mentionLinks, mentions, ratings, respects, searchEvents, syllabi, users } from "@/lib/db/schema";
import { courseRatings, ownRatings, pairRatings, respectCount, teacherRatings, userRatings } from "@/lib/ratings";
import { syllabus } from "../fixtures/catalog";
import { resetDb, seedCatalog } from "../fixtures/db";

const score = { clarity: 5, engagement: 4, organization: 3, expertise: 2, fairGrading: 1 };
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  await resetDb();
  await seedCatalog();
  jar.values.clear();
  const [row] = await db().insert(users).values({ email: "s@newuu.uz" }).returning();
  user.current = { id: row.id, email: row.email, group: null, isAdmin: false };
});
afterEach(() => vi.restoreAllMocks());

describe("signIn callback", () => {
  const check = (email: string, profile: object) => authOptions.callbacks!.signIn!({ user: { id: "1", email }, profile, account: null } as never);
  it("lets verified student accounts in", async () => {
    expect(await check("a@newuu.uz", { hd: "newuu.uz", email_verified: true })).toBe(true);
  });
  it("sends everyone else to the error screen", async () => {
    for (const [email, profile] of [
      ["a@gmail.com", { email_verified: true }],
      ["a@newuu.uz", { email_verified: true }],
      ["a@newuu.uz", { hd: "newuu.uz", email_verified: false }],
      ["a@newuu.uz.evil.com", { hd: "newuu.uz", email_verified: true }],
    ] as const) expect(await check(email, profile)).toBe("/sign-in?error=domain");
  });
});

describe("rating", () => {
  const rate = (extra = {}) => rateTeacher({ teacherId: "g-pinto", courseCode: "MATH111", ...score, ...extra });
  it("asks to sign in first", async () => {
    user.current = null;
    expect(await rate()).toEqual({ error: "signin" });
  });
  it("stores the average and updates instead of adding", async () => {
    expect(await rate()).toEqual({ ok: true });
    await rate({ clarity: 1 });
    const rows = await db().select().from(ratings);
    expect(rows).toHaveLength(1);
    expect(rows[0].overall).toBeCloseTo(2.2);
  });
  it("keeps a separate rating for each course of a teacher", async () => {
    await rate();
    await rate({ courseCode: "MATH211", clarity: 1 });
    const rows = await db().select().from(ratings);
    expect(rows.map((row) => row.courseCode).sort()).toEqual(["MATH111", "MATH211"]);
    expect((await pairRatings("MATH211")).get("g-pinto")?.clarity).toBe(1);
    expect((await courseRatings()).get("MATH111")?.teachers).toBe(1);
    expect(await ownRatings(user.current!.id, { teacherId: "g-pinto" })).toHaveLength(2);
  });
  it("refuses a course the teacher does not teach", async () => {
    expect(await rate({ courseCode: "PHYS101" })).toEqual({ error: "invalid" });
    expect(await rate({ teacherId: "nobody" })).toEqual({ error: "invalid" });
  });
  it("refuses scores outside 1 to 5", async () => {
    await expect(rate({ clarity: 6 })).rejects.toThrow();
    await expect(rate({ clarity: 0 })).rejects.toThrow();
    await expect(rate({ clarity: 2.5 })).rejects.toThrow();
  });
  it("averages across students by teacher and course", async () => {
    await rate();
    const [other] = await db().insert(users).values({ email: "b@newuu.uz" }).returning();
    user.current = { id: other.id, email: other.email, group: null, isAdmin: false };
    await rate({ clarity: 1, engagement: 1, organization: 1, expertise: 1, fairGrading: 1 });
    expect((await teacherRatings()).get("g-pinto")).toMatchObject({ count: 2, overall: 2 });
    expect((await courseRatings()).get("MATH111")?.clarity).toBe(3);
    expect(await userRatings(other.id)).toHaveLength(1);
  });
  it("lets a student remove their rating", async () => {
    await rate();
    await deleteRating("g-pinto", "MATH111");
    expect(await db().select().from(ratings)).toEqual([]);
  });
});

describe("respects", () => {
  it("counts each student once", async () => {
    await payRespect("g-pinto");
    await payRespect("g-pinto");
    expect(await respectCount("g-pinto")).toBe(1);
    expect(await db().select().from(respects)).toHaveLength(1);
  });
  it("needs a sign in", async () => {
    user.current = null;
    expect(await payRespect("g-pinto")).toEqual({ error: "signin" });
  });
});

describe("group", () => {
  const form = (group: string) => { const f = new FormData(); f.set("group", group); return f; };
  it("saves a real group and goes to My semester", async () => {
    await expect(chooseGroup(form("FCS 1"))).rejects.toThrow("REDIRECT /");
    expect(jar.values.get("group")).toBe("FCS 1");
    expect((await db().select().from(users))[0].group).toBe("FCS 1");
  });
  it("removes the group from the account and the cookie", async () => {
    await expect(chooseGroup(form("FCS 1"))).rejects.toThrow("REDIRECT");
    await expect(removeGroup()).rejects.toThrow("REDIRECT /");
    expect(jar.values.has("group")).toBe(false);
    expect((await db().select().from(users))[0].group).toBeNull();
  });
  it("ignores an unknown group", async () => {
    await chooseGroup(form("HACK"));
    expect(jar.values.size).toBe(0);
  });
  it("works without an account", async () => {
    user.current = null;
    await expect(chooseGroup(form("TESOL 1"))).rejects.toThrow("REDIRECT");
    expect(jar.values.get("group")).toBe("TESOL 1");
  });
});

describe("course content", () => {
  const add = (name: string, term: string, matched = true, extra = {}) => db().insert(syllabi).values({ courseCode: "MATH111", sourceName: name, matched, data: syllabus({ term, ...extra }) });
  it("shows the newest matched syllabus and hides unmatched ones", async () => {
    await add("old", "Fall 2023", true, { description: "old" });
    await add("new", "Fall 2024", true, { description: "new" });
    await add("hidden", "Fall 2026", false, { description: "hidden" });
    expect((await courseDetails("MATH111"))?.data.description).toBe("new");
  });
  it("has nothing without a syllabus", async () => expect(await courseDetails("MATH111")).toBeNull());
  it("keeps admin edits when a newer syllabus arrives", async () => {
    user.current!.isAdmin = true;
    await add("a", "Fall 2023");
    await saveOverride("MATH111", { description: "edited" });
    await add("b", "Fall 2025", true, { description: "newer" });
    expect((await courseDetails("MATH111"))?.data.description).toBe("edited");
  });
  it("blocks edits from non admins", async () => {
    await expect(saveOverride("MATH111", { description: "x" })).rejects.toThrow("Not allowed");
  });
  it("links requirements only when one course fits", async () => {
    const { courses } = await getCatalog();
    expect(resolveRequirement({ text: "Precalculus", code: "" }, courses).code).toBe("MATH101");
    expect(resolveRequirement({ text: "PHYS 101", code: "" }, courses).code).toBe("PHYS101");
    expect(resolveRequirement({ text: "High School Algebra", code: "" }, courses).code).toBeNull();
  });
  it("works out what a course unlocks", async () => {
    await add("a", "Fall 2024");
    const catalog = await getCatalog();
    expect((await unlocks("MATH101", catalog)).map((c) => c.code)).toEqual(["MATH111"]);
  });
  it("finds programs and teacher lines", async () => {
    const catalog = await getCatalog();
    expect(programsWith("MATH111", catalog).map((p) => p.slug)).toEqual(["bsc-cyber-security"]);
    expect(teacherLine(catalog.teachers[0])).toBe("Mathematics · 2 courses");
    expect(teacherLine({ department: null, teaches: [] })).toBe("Staff");
  });
  it("orders popular courses by real searches first", async () => {
    await db().insert(searchEvents).values([{ kind: "Course", targetId: "MATH211" }, { kind: "Course", targetId: "MATH211" }]);
    expect((await popularCourses(await getCatalog(), 2))[0].code).toBe("MATH211");
  });
  it("shows only approved files", async () => {
    await db().insert(materials).values([{ status: "approved", courseCode: "MATH111", fileName: "a", mimeType: "x", size: 1, publishedAt: new Date() }, { status: "pending", courseCode: "MATH111", fileName: "b", mimeType: "x", size: 1 }]);
    expect((await publishedFiles("MATH111")).map((f) => f.fileName)).toEqual(["a"]);
  });
  it("finds mentions by course and teacher, newest first, each post once", async () => {
    await db().insert(mentions).values([{ postId: 1, url: "u", text: "old", date: new Date("2026-01-01") }, { postId: 2, url: "u", text: "new", date: new Date("2026-02-01") }]);
    await db().insert(mentionLinks).values([{ postId: 1, kind: "course", target: "MATH111" }, { postId: 2, kind: "course", target: "MATH111" }, { postId: 2, kind: "course", target: "PHYS101" }, { postId: 2, kind: "teacher", target: "g-pinto" }]);
    const math = { code: "MATH111", subject: "Calculus 1", aliases: [], same_name_codes: [], teachers: [], classes: [] };
    const course = await mentionsFor({ kind: "course", course: math });
    expect(course.map((m) => m.text)).toEqual(["new", "old"]);
    const pinto = { id: "g-pinto", display_name: "Gonçalo Pinto" } as Teacher;
    expect(await mentionsFor({ kind: "teacher", teacher: pinto })).toHaveLength(1);
  });
  it("puts posts that name the subject before partial matches", async () => {
    await db().insert(mentions).values([{ postId: 1, url: "u", text: "MATH111 was fine" }, { postId: 2, url: "u", text: "maths again" }]);
    await db().insert(mentionLinks).values([{ postId: 1, kind: "course", target: "MATH111" }, { postId: 2, kind: "course", target: "MATH111" }]);
    const math = { code: "MATH111", subject: "Calculus 1", aliases: [], same_name_codes: [], teachers: [], classes: [] };
    expect((await mentionsFor({ kind: "course", course: math })).map((m) => [m.postId, m.certainty])).toEqual([[1, "exact"], [2, "possible"]]);
    expect((await mentionsFor({ kind: "course", course: math }, "new")).map((m) => m.postId)).toEqual([2, 1]);
  });
  it("reads the whole channel by page and by word", async () => {
    await db().insert(mentions).values([{ postId: 1, url: "u", text: "first post" }, { postId: 2, url: "u", text: "second post" }]);
    expect((await channelPosts("", 1)).total).toBe(2);
    expect((await channelPosts("", 1)).items[0].postId).toBe(2);
    expect((await channelPosts("", 1, 1)).items[0].postId).toBe(1);
    expect((await channelPosts("FIRST", 10)).items.map((m) => m.postId)).toEqual([1]);
  });
});

describe("routes", () => {
  const url = (q: string) => new Request(`https://x/api/search?q=${encodeURIComponent(q)}`);
  it("answers health checks", async () => expect((await health()).status).toBe(200));
  it("protects the sync job", async () => {
    expect((await cron(new Request("https://x", { method: "POST" }))).status).toBe(401);
    expect((await cron(new Request("https://x", { method: "POST", headers: { authorization: "Bearer wrong-secret" } }))).status).toBe(401);
  });
  it("searches codes, names and accents", async () => {
    expect((await (await search(url("math111"))).json()).results[0].href).toBe("/courses/MATH111");
    expect((await (await search(url("goncalo"))).json()).results[0].href).toBe("/professors/g-pinto");
    expect((await (await search(url("zzzz"))).json()).results).toEqual([]);
  });
  it("counts opens without knowing who opened", async () => {
    await track(new Request("https://x", { method: "POST", body: JSON.stringify({ kind: "Course", id: "MATH111" }) }));
    expect(Object.keys((await db().select().from(searchEvents))[0])).toEqual(["id", "kind", "targetId", "createdAt"]);
  });
  it("serves approved files only", async () => {
    const [ok] = await db().insert(materials).values({ status: "approved", fileName: "a", mimeType: "x", size: 1, storageKey: "k" }).returning();
    const [waiting] = await db().insert(materials).values({ status: "pending", fileName: "b", mimeType: "x", size: 1, storageKey: "k" }).returning();
    expect((await openFile(new Request("https://x"), params(ok.id))).status).toBe(302);
    expect((await openFile(new Request("https://x"), params(waiting.id))).status).toBe(404);
    expect((await openFile(new Request("https://x"), params("' or 1=1"))).status).toBe(404);
  });
});
