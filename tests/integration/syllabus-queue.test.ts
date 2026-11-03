import { beforeEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({ current: null as null | { id: string; email: string; isAdmin: boolean } }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  getUser: async () => user.current,
}));
vi.mock("@/lib/storage", async (original) => ({
  ...(await original<typeof import("@/lib/storage")>()),
  signedUrl: async (key: string, name?: string) => `https://bucket.test/${key}?name=${encodeURIComponent(name ?? "")}&sig=x`,
}));

import { eq } from "drizzle-orm";
import { GET as queueRoute } from "@/app/api/admin/syllabus/queue/route";
import { POST as submitRoute } from "@/app/api/admin/syllabus/route";
import { db } from "@/lib/db";
import type { SyllabusData } from "@/lib/db/schema";
import { auditLog, syllabi, syllabusQueue, users } from "@/lib/db/schema";
import { enqueueSyllabus } from "@/server/syllabus-queue";
import { syllabus } from "../fixtures/catalog";
import { resetDb, seedCatalog } from "../fixtures/db";

const BEARER = "Bearer cron-secret";
const submit = (body: unknown, auth: string | null = BEARER) =>
  submitRoute(new Request("https://x/api/admin/syllabus", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) } }));
const queue = (auth: string | null = BEARER) => queueRoute(new Request("https://x/api/admin/syllabus/queue", { headers: auth ? { authorization: auth } : {} }));

const data = (extra: Partial<SyllabusData> = {}) => ({ is_syllabus: true, ...syllabus(extra) });
const lmsItem = { courseCode: "MATH111", sourceKey: "lms:4400", fileId: "4400", storageKey: "lms/906/4400.pdf", name: "Syllabus.pdf", origin: "lms" as const };
const importItem = { courseCode: "MATH211", sourceKey: "tg:2486971545:8", fileId: "0b6a7a35-0000-4000-8000-000000000001", storageKey: "uploads/abc.pdf", name: "Calc 2 syllabus.pdf", origin: "import" as const };

beforeEach(async () => {
  await resetDb();
  await seedCatalog();
  user.current = null;
});

describe("syllabus endpoints: who may call", () => {
  it("refuses without the cron secret or an admin session", async () => {
    await enqueueSyllabus(lmsItem);
    for (const auth of [null, "Bearer wrong", "cron-secret"]) {
      expect((await queue(auth)).status).toBe(401);
      expect((await submit({ courseCode: "MATH111", data: data() }, auth)).status).toBe(401);
    }
    const [student] = await db().insert(users).values({ email: "s1@newuu.uz" }).returning();
    user.current = { id: student.id, email: student.email, isAdmin: false };
    expect((await queue(null)).status).toBe(401);
    expect((await submit({ courseCode: "MATH111", data: data() }, null)).status).toBe(401);
    expect(await db().select().from(syllabi)).toHaveLength(0);
    expect(await db().select().from(syllabusQueue)).toHaveLength(1);
  });

  it("lets a signed-in admin in, but not with a wrong bearer token", async () => {
    const [admin] = await db().insert(users).values({ email: "boss@newuu.uz" }).returning();
    user.current = { id: admin.id, email: admin.email, isAdmin: true };
    expect((await queue(null)).status).toBe(200);
    expect((await queue("Bearer wrong")).status).toBe(401);
    expect((await submit({ courseCode: "MATH111", data: data() }, null)).status).toBe(200);
    const [entry] = await db().select().from(auditLog).where(eq(auditLog.action, "syllabus.submit"));
    expect(entry).toMatchObject({ actorId: admin.id, target: "course:MATH111" });
  });
});

describe("syllabus submit: validation", () => {
  it("refuses bodies that aren't a parsed syllabus", async () => {
    const bad = async (body: unknown, pattern: RegExp, status = 400) => {
      const res = await submit(body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(status);
      expect((await res.json()).error).toMatch(pattern);
    };
    await bad("not json", /JSON/);
    await bad({ data: data() }, /courseCode/);
    await bad({ courseCode: "MATH111" }, /data/);
    await bad({ courseCode: "MATH111", data: { ...data(), credits: "three" } }, /data\.credits/);
    await bad({ courseCode: "MATH111", data: { ...data(), prerequisites: { status: "maybe", groups: [] } } }, /data\.prerequisites\.status/);
    const { learning_outcomes: _gone, ...missing } = data();
    await bad({ courseCode: "MATH111", data: missing }, /data\.learning_outcomes/);
    await bad({ courseCode: "NOPE999", data: data() }, /Unknown course NOPE999/);
    await bad({ courseCode: "MATH111", fileId: "nope", data: data() }, /No queued syllabus with file id nope/, 404);
    expect(await db().select().from(syllabi)).toHaveLength(0);
  });

  it("won't answer one course's queued file with another course", async () => {
    await enqueueSyllabus(lmsItem);
    const res = await submit({ courseCode: "MATH211", sourceKey: "lms:4400", data: data() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/queued for MATH111/);
    expect(await db().select().from(syllabusQueue)).toHaveLength(1);
  });

  it("asks which file when a course has several waiting", async () => {
    await enqueueSyllabus(lmsItem);
    await enqueueSyllabus({ ...lmsItem, sourceKey: "tg:1:2", fileId: "x", origin: "import" });
    const res = await submit({ courseCode: "MATH111", data: data() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/2 files are queued for MATH111/);
  });
});

describe("syllabus queue lifecycle", () => {
  it("lists waiting files with download links, stores a submission and clears its item", async () => {
    expect(await enqueueSyllabus(lmsItem)).toBe(true);
    expect(await enqueueSyllabus(lmsItem)).toBe(true); // already waiting: still one row
    await enqueueSyllabus(importItem);

    const listed = await (await queue()).json();
    expect(listed.count).toBe(2);
    expect(listed.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ courseCode: "MATH111", sourceKey: "lms:4400", fileId: "4400", name: "Syllabus.pdf", origin: "lms", url: expect.stringMatching(/^https:\/\/bucket\.test\/lms\/906\/4400\.pdf\?name=Syllabus\.pdf/) }),
        expect.objectContaining({ courseCode: "MATH211", sourceKey: "tg:2486971545:8", origin: "import", url: expect.stringContaining("uploads/abc.pdf") }),
      ])
    );
    // The bucket key itself is not handed out.
    expect(JSON.stringify(listed)).not.toContain("storageKey");

    // By file id; the weights are off, so it is stored with a flag.
    const res = await submit({ courseCode: "MATH 111", fileId: "4400", data: data({ assessment: [{ name: "Final", weight_percent: 90, timing: "" }] }) });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ result: "stored", courseCode: "MATH111", sourceKey: "lms:4400", cleared: 1, flags: ["Assessment weights add up to 90%."] });
    const [row] = await db().select().from(syllabi);
    expect(row).toMatchObject({ id: out.id, courseCode: "MATH111", sourceName: "lms:4400", matched: true, flags: ["Assessment weights add up to 90%."] });
    expect(row.data).not.toHaveProperty("is_syllabus");
    expect(row.data.assessment).toEqual([{ name: "Final", weight_percent: 90, timing: "" }]);
    expect((await (await queue()).json()).items.map((i: { sourceKey: string }) => i.sourceKey)).toEqual(["tg:2486971545:8"]);

    // Once parsed, the same file is not queued again.
    expect(await enqueueSyllabus(lmsItem)).toBe(false);
    expect(await db().select().from(syllabusQueue)).toHaveLength(1);

    // A correction to the same source replaces the data, still one row.
    const again = await (await submit({ courseCode: "MATH111", sourceKey: "lms:4400", data: data() })).json();
    expect(again).toMatchObject({ result: "updated", id: out.id, flags: [], cleared: 0 });
    expect(await db().select().from(syllabi)).toHaveLength(1);
  });

  it("finds the course's only waiting file, flags a document naming another course", async () => {
    await enqueueSyllabus(importItem);
    const out = await (await submit({ courseCode: "MATH211", data: data({ course_code: "MATH 111", course_title: "Calculus 1" }) })).json();
    expect(out).toMatchObject({ result: "stored", sourceKey: "tg:2486971545:8", cleared: 1 });
    expect(out.flags).toContain("names MATH111");
    expect(await db().select().from(syllabusQueue)).toHaveLength(0);
  });

  it("clears a file that isn't a syllabus without storing anything", async () => {
    await enqueueSyllabus(importItem);
    const out = await (await submit({ courseCode: "MATH211", sourceKey: importItem.sourceKey, data: { ...data(), is_syllabus: false } })).json();
    expect(out).toEqual({ result: "not a syllabus", courseCode: "MATH211", sourceKey: importItem.sourceKey, cleared: 1 });
    expect(await db().select().from(syllabi)).toHaveLength(0);
    expect(await db().select().from(syllabusQueue)).toHaveLength(0);
  });

  it("stores a syllabus with nothing queued under a stable operator key", async () => {
    const body = { courseCode: "MATH111", data: syllabus() }; // is_syllabus may be left out
    const one = await (await submit(body)).json();
    expect(one).toMatchObject({ result: "stored", cleared: 0, sourceKey: expect.stringMatching(/^operator:MATH111:[0-9a-f]{16}$/) });
    expect(await (await submit(body)).json()).toMatchObject({ result: "updated", sourceKey: one.sourceKey });
  });
});
