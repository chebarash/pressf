import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalog } from "@/lib/catalog";
import { db } from "@/lib/db";
import { adminMarks, lmsCourses, lmsTeachers, mentionLinks, mentions, teacherAliases } from "@/lib/db/schema";
import { linkKey } from "@/core/mentions";
import { env } from "@/lib/env";
import { nightlySync, syncMentions } from "@/lib/mentions";
import { resetDb } from "../fixtures/db";

type Handler = (path: string) => unknown;

function stub(handler: Handler) {
  const calls: Array<{ path: string; auth: string | null }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace("https://bot.test", "");
    calls.push({ path, auth: new Headers(init.headers).get("authorization") });
    const value = handler(path.split("?")[0]);
    if (value === undefined) return new Response(null, { status: 500 });
    return Response.json(value);
  }));
  return calls;
}

beforeEach(resetDb);
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("nightlySync", () => {
  it("does not call the bot while mentions are switched off", async () => {
    const calls = stub(() => ({ items: [] }));
    expect(await nightlySync()).toEqual({ failed: [] });
    expect(calls).toEqual([]);
  });
});

describe("mentions", () => {
  // The bot's export has no links any more: Press F finds them.
  const TEXT: Record<number, string> = {
    1: "Is MATH111 hard?",
    2: "calc 2 with prof Pinto or someone else?",
    3: "Where is the library?",
    4: "Kayumov Abduazizning emaili kerak",
  };
  const post = (id: number) => ({ post_id: id, url: `https://t.me/x/${id}`, text: TEXT[id] ?? `post ${id}`, date: "2026-10-01T00:00:00Z" });
  const channel = (posts: number[], ids: number[], text: Record<number, string> = {}) => (path: string) => {
    if (path === "/api/mentions/export") return { items: posts.map((id) => ({ ...post(id), ...(text[id] ? { text: text[id] } : {}) })), next_offset: null };
    if (path === "/api/posts/ids") return { items: ids };
    return undefined;
  };
  const links = async () => (await db().select().from(mentionLinks)).map((l) => `${l.postId} ${l.kind} ${l.target}`).sort();

  beforeEach(async () => {
    await db().insert(lmsCourses).values([
      { id: "s1", code: "MATH111", name: "Calculus 1", raw: {} },
      { id: "s2", code: "MATH112", name: "Calculus 2", raw: {} },
    ]);
    await db().insert(lmsTeachers).values([
      { id: "36", firstName: "Gonçalo", surName: "Pinto" },
      { id: "167", firstName: "Abduaziz", surName: "Kayumov" },
    ]);
  });

  it("stores every post, finds its courses and professors, and removes deleted posts", async () => {
    const calls = stub(channel([1, 2, 3, 4], [1, 2, 3, 4]));
    const result = await syncMentions();
    expect(calls.every((call) => call.auth === "Bearer bot-token")).toBe(true);
    expect(result).toMatchObject({ posts: 4, added: 4, rematched: 4, links: { course: 2, teacher: 2 } });
    expect(await links()).toEqual(["1 course MATH111", "2 course MATH112", "2 teacher 36", "4 teacher 167"]);
    stub(channel([1, 2], [1, 2, 4]));
    await syncMentions();
    expect((await db().select().from(mentions)).map((row) => row.postId).sort()).toEqual([1, 2, 4]);
    expect(await links()).toEqual(["1 course MATH111", "2 course MATH112", "2 teacher 36", "4 teacher 167"]);
  });

  it("matches only new or edited posts, and everything again when the matcher changes", async () => {
    stub(channel([1, 2, 3], [1, 2, 3]));
    await syncMentions();
    stub(channel([1, 2, 3, 4], [1, 2, 3, 4], { 3: "Calculus 1 tutorial?" }));
    const second = await syncMentions();
    expect(second).toMatchObject({ added: 1, changed: 1, rematched: 2 });
    expect(await links()).toContain("3 course MATH111");
    // A merge (or a new course, or new rules) changes the matcher: one full pass.
    await db().insert(lmsTeachers).values({ id: "37", firstName: "Gonçalo", surName: "Pinto" });
    await db().insert(teacherAliases).values({ oldId: "36", teacherId: "37" });
    const third = await syncMentions();
    expect(third.rematched).toBe(4);
    expect(await links()).toContain("2 teacher 37");
    expect(await links()).not.toContain("2 teacher 36");
    expect((await syncMentions()).rematched).toBe(0);
  });

  it("keeps a hidden link hidden through every re-match", async () => {
    stub(channel([1, 2], [1, 2]));
    await syncMentions();
    await db().insert(adminMarks).values({ kind: "mention-link-hidden", target: linkKey(2, "teacher", "36"), data: {} });
    await db().insert(lmsCourses).values({ id: "s3", code: "PHYS101", name: "Physics 1", raw: {} });
    expect((await syncMentions()).rematched).toBe(2);
    expect(await links()).toEqual(["1 course MATH111", "2 course MATH112"]);
  });

  it("keeps posts without a date", async () => {
    stub((path) => (path === "/api/mentions/export" ? { items: [{ ...post(9), date: null }], next_offset: null } : path === "/api/posts/ids" ? { items: [9] } : undefined));
    await syncMentions();
    expect((await db().select().from(mentions))[0].date).toBeNull();
  });

  it("does not wipe posts when the id list looks broken", async () => {
    stub(channel([1, 2, 3], [1, 2, 3]));
    await syncMentions();
    stub(channel([], []));
    await expect(syncMentions()).rejects.toThrow("Refusing");
    expect(await db().select().from(mentions)).toHaveLength(3);
  });

  it("reports what it did in the nightly result", async () => {
    // env() is read once and cached; switch the flag on the cached copy.
    const settings = env();
    settings.MENTIONS_SYNC = "on";
    stub(channel([1, 2], [1, 2]));
    const result = await nightlySync().finally(() => { settings.MENTIONS_SYNC = undefined; });
    expect(result.failed).toEqual([]);
    expect(result.mentions).toMatchObject({ posts: 2, links: { course: 2, teacher: 1 }, top: { course: [{ target: "MATH111", posts: 1 }, { target: "MATH112", posts: 1 }], teacher: [{ target: "36", posts: 1 }] } });
  });
});

describe("getCatalog", () => {
  it("is empty rather than broken before the first harvest", async () => {
    expect((await getCatalog()).courses).toEqual([]);
  });
});
