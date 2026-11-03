import { beforeEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({ current: null as null | { id: string; email: string; isAdmin: boolean } }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  getUser: async () => user.current,
}));
const bucket = vi.hoisted(() => new Map<string, number>());
vi.mock("@/lib/storage", async (original) => ({
  ...(await original<typeof import("@/lib/storage")>()),
  putObject: async (key: string, body: Buffer) => { bucket.set(key, body.length); return key; },
  objectExists: async (key: string) => bucket.has(key),
}));

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { POST as commitRoute } from "@/app/api/admin/import/commit/route";
import { POST as planRoute } from "@/app/api/admin/import/plan/route";
import { db } from "@/lib/db";
import { lmsFiles, syllabusQueue, uploads, users } from "@/lib/db/schema";
import { resetDb, seedCatalog } from "../fixtures/db";

const CHANNEL = { id: "2486971545", name: "PU Materials" };

/** A one-page PDF whose only text is `text` (the fixture for the PDF fallback). */
async function pdf(text: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 200]);
  page.drawText(text, { x: 20, y: 100, size: 12, font: await doc.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await doc.save());
}

function form(meta: Record<string, unknown>, bytes: Buffer | null, decision?: Record<string, unknown>) {
  const f = new FormData();
  f.set("meta", JSON.stringify({ channel: CHANNEL, ...meta }));
  if (bytes) f.set("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), String(meta.fileName));
  if (decision) f.set("decision", JSON.stringify(decision));
  return f;
}

const call = (route: (r: Request) => Promise<Response>, body: FormData, auth: string | null = "Bearer cron-secret") =>
  route(new Request("https://x/api/admin/import", { method: "POST", body, headers: auth ? { authorization: auth } : {} }));

const plan = async (meta: Record<string, unknown>, bytes: Buffer | null) => {
  const res = await call(planRoute, form(meta, bytes));
  expect(res.status).toBe(200);
  return res.json();
};

beforeEach(async () => {
  await resetDb();
  await seedCatalog();
  bucket.clear();
  user.current = null;
});

describe("import auth", () => {
  it("refuses without the cron secret or an admin session", async () => {
    const bytes = await pdf("Calculus 1");
    expect((await call(planRoute, form({ postId: 1, fileName: "a.pdf" }, bytes), null)).status).toBe(401);
    expect((await call(planRoute, form({ postId: 1, fileName: "a.pdf" }, bytes), "Bearer wrong")).status).toBe(401);
    expect((await call(commitRoute, form({ postId: 1, fileName: "a.pdf" }, bytes, { course: "MATH111", type: "notes", title: "A" }), "Bearer wrong")).status).toBe(401);
    const [student] = await db().insert(users).values({ email: "s1@newuu.uz" }).returning();
    user.current = { id: student.id, email: student.email, isAdmin: false };
    expect((await call(planRoute, form({ postId: 1, fileName: "a.pdf" }, bytes), null)).status).toBe(401);
  });

  it("lets a signed-in admin in", async () => {
    const [admin] = await db().insert(users).values({ email: "boss@newuu.uz" }).returning();
    user.current = { id: admin.id, email: admin.email, isAdmin: true };
    const res = await call(planRoute, form({ postId: 1, fileName: "MATH111 notes.pdf" }, await pdf("x")), null);
    expect(res.status).toBe(200);
  });
});

describe("plan", () => {
  it("matches the course from a code with a space, and writes nothing", async () => {
    const p = await plan({ postId: 8, date: "2024-12-18T10:00:00", fileName: "MATH 211 Calculus 2, Fall 20240.pdf", text: "Calculus 2 - Syllabus" }, await pdf("syllabus"));
    expect(p.candidates[0]).toMatchObject({ code: "MATH211", score: 1 });
    expect(p).toMatchObject({ confidence: "high", type: "syllabus", title: "Syllabus", term: "Fall 2024", termFrom: "date", sourceKey: "tg:2486971545:8", duplicateOf: null, imported: null });
    expect(await db().select().from(uploads)).toHaveLength(0);
  });

  it("reads the course from the PDF's first pages when the name and post say nothing", async () => {
    const p = await plan({ postId: 9, fileName: "file.pdf", text: "" }, await pdf("New Uzbekistan University  PHYS 101  Physics 1  Course syllabus"));
    expect(p.candidates[0].code).toBe("PHYS101");
    expect(p.candidates[0].reason).toContain("PDF text");
  });

  it("flags unreadable, calendar and very large files", async () => {
    const broken = await plan({ postId: 10, fileName: "Calculus 1 - Final.pdf", text: "" }, Buffer.from("%PDF-1.4 not really"));
    expect(broken.flags).toContain("unreadable");
    const calendar = await plan({ postId: 11, fileName: "Academic calendar - 2026-2027.pdf", text: "#calendar" }, await pdf("calendar"));
    expect(calendar.flags).toContain("not a course file: academic calendar");
    const big = await plan({ postId: 12, fileName: "Book.pdf", text: "#book Textbook of Calculus 1", sha256: "a".repeat(64), size: 60 * 1024 * 1024 }, null);
    expect(big.flags).toContain("very large (60 MB)");
    expect(big.type).toBe("book");
    const res = await call(planRoute, form({ postId: 13, fileName: "small.pdf", sha256: "a".repeat(64), size: 100 }, null));
    expect(res.status).toBe(400);
  });

  it("reports a copy of an upload and a similar LMS file", async () => {
    const bytes = await pdf("Calculus 1 final");
    const sha = createHash("sha256").update(bytes).digest("hex");
    const [mine] = await db().insert(uploads).values({ courseId: "fixture-MATH111", courseCode: "MATH111", title: "Final", type: "exam", fileName: "x.pdf", mimeType: "application/pdf", size: bytes.length, sha256: sha, status: "live" }).returning();
    const exact = await plan({ postId: 65, fileName: "Calculus 1 - Final.pdf", text: "" }, bytes);
    expect(exact.duplicateOf).toMatchObject({ kind: "upload", id: mine.id, reason: "same bytes" });

    await db().insert(lmsFiles).values({ id: "L1", courseId: "fixture-MATH211", code: "MATH211", name: "Calculus 2 Mock Exam.pdf", storageKey: "k", size: 777 });
    const similar = await plan({ postId: 45, fileName: "Calculus2 Mock Exam.pdf", text: "Calculus 2 mock" }, await pdf("mock"));
    expect(similar.duplicateOf).toMatchObject({ kind: "lms", id: "L1", reason: "similar name" });
  });
});

describe("commit", () => {
  const meta = { postId: 41, date: "2025-02-20T12:00:00", fileName: "Calculus2_midterm_answerts_fall2024.pdf", text: "#midterm Calculus 2 - Midterm questions and solutions for Fall 2024" };
  const decision = { course: "MATH211", type: "exam", exam: "midterm", title: "Midterm exam, Fall 2024, with solutions", term: "Fall 2024" };

  it("publishes live as the channel, and a re-run updates the same row", async () => {
    const bytes = await pdf("midterm");
    const first = await (await call(commitRoute, form(meta, bytes, decision))).json();
    expect(first).toMatchObject({ result: "created", courseCode: "MATH211", sourceKey: "tg:2486971545:41" });
    const [row] = await db().select().from(uploads).where(eq(uploads.id, first.id));
    expect(row).toMatchObject({ status: "live", uploaderId: null, sourceLabel: "the channel PU Materials", courseId: "fixture-MATH211", exam: "midterm", term: "Fall 2024" });
    expect(row.storageKey).toBe(`uploads/${row.sha256}.pdf`);
    expect(bucket.has(row.storageKey!)).toBe(true);
    expect(row.createdAt.toISOString()).toBe("2025-02-20T07:00:00.000Z");

    const again = await (await call(commitRoute, form(meta, bytes, { ...decision, title: "Midterm, Fall 2024" }))).json();
    expect(again).toMatchObject({ result: "updated", id: first.id });
    const rows = await db().select().from(uploads);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Midterm, Fall 2024");

    const planned = await plan(meta, bytes);
    expect(planned).toMatchObject({ imported: first.id, duplicateOf: null });
  });

  it("keeps someone else's copy of the same file instead of adding one", async () => {
    const bytes = await pdf("midterm");
    const sha = createHash("sha256").update(bytes).digest("hex");
    const [theirs] = await db().insert(uploads).values({ courseId: "fixture-MATH211", courseCode: "MATH211", title: "Midterm", type: "exam", fileName: "m.pdf", mimeType: "application/pdf", size: bytes.length, sha256: sha, status: "live" }).returning();
    const out = await (await call(commitRoute, form(meta, bytes, decision))).json();
    expect(out).toMatchObject({ result: "duplicate", duplicateOf: theirs.id });
    expect(await db().select().from(uploads)).toHaveLength(1);
  });

  it("skips, and refuses an unknown course", async () => {
    const bytes = await pdf("x");
    expect(await (await call(commitRoute, form(meta, bytes, { ...decision, skip: true }))).json()).toMatchObject({ result: "skipped" });
    const bad = await call(commitRoute, form(meta, bytes, { ...decision, course: "NOPE999" }));
    expect(bad.status).toBe(400);
    expect(await db().select().from(uploads)).toHaveLength(0);
  });

  it("queues an imported syllabus for the operator", async () => {
    const out = await (await call(commitRoute, form({ ...meta, postId: 8, fileName: "Syllabus.pdf", text: "Calculus 2 - Syllabus" }, await pdf("syllabus"), { course: "MATH 211", type: "syllabus", title: "Syllabus" }))).json();
    expect(out).toMatchObject({ result: "created", syllabus: "queued" });
    const queue = await db().select().from(syllabusQueue);
    expect(queue).toEqual([expect.objectContaining({ courseCode: "MATH211", sourceKey: "tg:2486971545:8", fileId: out.id, name: "Syllabus.pdf", origin: "import", storageKey: expect.stringMatching(/^uploads\/[0-9a-f]{64}\.pdf$/) })]);
    // The same post again: still one item.
    await call(commitRoute, form({ ...meta, postId: 8, fileName: "Syllabus.pdf", text: "Calculus 2 - Syllabus" }, await pdf("syllabus"), { course: "MATH 211", type: "syllabus", title: "Syllabus" }));
    expect(await db().select().from(syllabusQueue)).toHaveLength(1);
  });
});
