import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalog, isStale } from "@/lib/catalog";
import { mergeTeacherIds, syncCatalog, syncMentions } from "@/lib/catalog/sync";
import { db } from "@/lib/db";
import { catalogCache, faces, mentionLinks, mentions, ratings, respects, teacherAliases, users } from "@/lib/db/schema";
import { catalog, teacher } from "../fixtures/catalog";
import { resetDb } from "../fixtures/db";

const BUILT = "2026-11-01T00:00:00+00:00";
type Handler = (path: string) => unknown;

const body: Handler = (path) => {
  if (path === "/api/faculty") return { updated_at: BUILT, items: catalog.teachers };
  if (path === "/api/courses") return { updated_at: BUILT, items: catalog.courses };
  if (path === "/api/timetable") return { updated_at: BUILT, items: catalog.timetable };
  if (path === "/api/groups") return { updated_at: BUILT, items: catalog.groups };
  if (path === "/api/semesters") return catalog.semesters;
  if (path === "/api/schools") return { updated_at: BUILT, items: catalog.schools };
  const slug = path.match(/programs\/(.+)\/curriculum/)?.[1];
  if (slug) return { updated_at: BUILT, ...catalog.curricula[slug] };
  return { items: [] };
};

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

describe("syncCatalog", () => {
  it("copies the bot into the cache with the build date and token", async () => {
    const calls = stub(body);
    expect(await syncCatalog()).toEqual({ failed: [] });
    const data = await getCatalog();
    expect(data.teachers).toHaveLength(2);
    expect(data.curricula["bsc-cyber-security"].semesters).toHaveLength(2);
    expect(data.semesters.next?.starts).toBe("2027-02-22");
    expect(calls.every((call) => call.auth === "Bearer bot-token")).toBe(true);
    const [row] = await db().select().from(catalogCache).where(eq(catalogCache.key, "teachers"));
    expect(row.sourceUpdatedAt?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("keeps the old copy when one endpoint fails", async () => {
    stub(body);
    await syncCatalog();
    vi.spyOn(console, "error").mockImplementation(() => {});
    stub((path) => (path === "/api/courses" ? undefined : body(path)));
    expect((await syncCatalog()).failed).toEqual(["courses"]);
    expect((await getCatalog()).courses).toHaveLength(4);
  });

  it("refuses a list that shrank by more than half", async () => {
    stub(body);
    await syncCatalog();
    vi.spyOn(console, "error").mockImplementation(() => {});
    stub((path) => (path === "/api/timetable" ? { items: [] } : body(path)));
    expect((await syncCatalog()).failed).toContain("timetable");
    expect((await getCatalog()).timetable).toHaveLength(2);
  });

  it("does not touch mentions while they are switched off", async () => {
    const calls = stub(body);
    await syncCatalog();
    expect(calls.some((call) => call.path.includes("mentions"))).toBe(false);
  });

  it("merges ids on sync", async () => {
    const [user] = await db().insert(users).values({ email: "a@newuu.uz" }).returning();
    await db().insert(ratings).values({ userId: user.id, teacherId: "pinto-goncalo", courseCode: "MATH111", clarity: 5, engagement: 5, organization: 5, expertise: 5, fairGrading: 5, overall: 5 });
    stub((path) => (path === "/api/faculty" ? { items: [teacher("g-pinto", { previous_ids: ["pinto-goncalo"] })] } : body(path)));
    await syncCatalog();
    const [row] = await db().select().from(ratings);
    expect(row.teacherId).toBe("g-pinto");
  });
});

describe("mergeTeacherIds", () => {
  const score = { courseCode: "X", clarity: 3, engagement: 3, organization: 3, expertise: 3, fairGrading: 3 };
  const merged = [teacher("t-new", { previous_ids: ["old-slug"] })];

  it("keeps the newer rating when a student rated both records", async () => {
    const [a] = await db().insert(users).values({ email: "a@newuu.uz" }).returning();
    const [b] = await db().insert(users).values({ email: "b@newuu.uz" }).returning();
    await db().insert(ratings).values([
      { ...score, userId: a.id, teacherId: "old-slug", overall: 1, updatedAt: new Date("2026-06-01") },
      { ...score, userId: a.id, teacherId: "t-new", overall: 2, updatedAt: new Date("2026-01-01") },
      { ...score, userId: b.id, teacherId: "old-slug", overall: 3, updatedAt: new Date("2026-01-01") },
      { ...score, userId: b.id, teacherId: "t-new", overall: 4, updatedAt: new Date("2026-06-01") },
    ]);
    await mergeTeacherIds(merged);
    const rows = await db().select().from(ratings);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.teacherId === "t-new")).toBe(true);
    expect(rows.find((row) => row.userId === a.id)?.overall).toBe(1);
    expect(rows.find((row) => row.userId === b.id)?.overall).toBe(4);
  });

  it("counts a respect once and moves faces", async () => {
    const [a] = await db().insert(users).values({ email: "a@newuu.uz" }).returning();
    await db().insert(respects).values([{ userId: a.id, teacherId: "old-slug" }, { userId: a.id, teacherId: "t-new" }]);
    await db().insert(faces).values({ teacherId: "old-slug", storageKey: "k" });
    await mergeTeacherIds(merged);
    expect(await db().select().from(respects)).toHaveLength(1);
    expect((await db().select().from(faces))[0].teacherId).toBe("t-new");
  });

  it("records the alias and is safe to repeat", async () => {
    await mergeTeacherIds(merged);
    await mergeTeacherIds(merged);
    expect(await db().select().from(teacherAliases)).toEqual([{ oldId: "old-slug", teacherId: "t-new" }]);
  });

  it("ignores an id listed as its own past", async () => {
    await mergeTeacherIds([teacher("same", { previous_ids: ["same"] })]);
    expect(await db().select().from(teacherAliases)).toEqual([]);
  });
});

describe("mentions", () => {
  const post = (id: number) => ({ post_id: id, url: `https://t.me/x/${id}`, text: `post ${id}`, date: "2026-10-01T00:00:00Z", links: [{ kind: "course", code: "MATH111" }] });
  const channel = (posts: number[], ids: number[]) => (path: string) => {
    if (path === "/api/mentions/export") return { items: posts.map(post), next_offset: null };
    if (path === "/api/posts/ids") return { items: ids };
    return body(path);
  };

  it("stores posts with links and removes deleted ones", async () => {
    stub(channel([1, 2, 3], [1, 2, 3]));
    await syncMentions();
    stub(channel([1, 2], [1, 2, 4]));
    await syncMentions();
    expect((await db().select().from(mentions)).map((row) => row.postId).sort()).toEqual([1, 2]);
    expect(await db().select().from(mentionLinks)).toHaveLength(2);
  });

  it("keeps posts without a date", async () => {
    stub((path) => (path === "/api/mentions/export" ? { items: [{ ...post(9), date: null }], next_offset: null } : path === "/api/posts/ids" ? { items: [9] } : body(path)));
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
  it("is empty rather than broken before the first sync", async () => {
    const data = await getCatalog();
    expect(data.courses).toEqual([]);
    expect(isStale(data)).toBe(false);
  });
});
