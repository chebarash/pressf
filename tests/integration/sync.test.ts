import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalog } from "@/lib/catalog";
import { db } from "@/lib/db";
import { mentionLinks, mentions } from "@/lib/db/schema";
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
  const post = (id: number) => ({ post_id: id, url: `https://t.me/x/${id}`, text: `post ${id}`, date: "2026-10-01T00:00:00Z", links: [{ kind: "course", code: "MATH111" }] });
  const channel = (posts: number[], ids: number[]) => (path: string) => {
    if (path === "/api/mentions/export") return { items: posts.map(post), next_offset: null };
    if (path === "/api/posts/ids") return { items: ids };
    return undefined;
  };

  it("stores posts with links and removes deleted ones", async () => {
    const calls = stub(channel([1, 2, 3], [1, 2, 3]));
    await syncMentions();
    expect(calls.every((call) => call.auth === "Bearer bot-token")).toBe(true);
    stub(channel([1, 2], [1, 2, 4]));
    await syncMentions();
    expect((await db().select().from(mentions)).map((row) => row.postId).sort()).toEqual([1, 2]);
    expect(await db().select().from(mentionLinks)).toHaveLength(2);
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
});

describe("getCatalog", () => {
  it("is empty rather than broken before the first harvest", async () => {
    expect((await getCatalog()).courses).toEqual([]);
  });
});
