import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/covers/source", async (original) => ({
  ...(await original<typeof import("@/server/covers/source")>()),
  fileSource: async (id: string) => ({ id }),
  deliverUrl: async (src: { id: string }) => `https://bucket.test/${src.id}.pdf`,
}));

import { createHmac } from "node:crypto";
import { POST } from "@/app/api/telegram/send-file/route";
import { db } from "@/lib/db";
import { lmsFiles, telegramFiles, users } from "@/lib/db/schema";
import { resetDb, seedCatalog } from "../fixtures/db";

/** Bot API calls the route made: method and the multipart fields it sent. */
type Sent = { method: string; chat: string; document: string };
let sent: Sent[];
let failWith: string | null;
let fileIds: number;

beforeEach(async () => {
  await resetDb();
  await seedCatalog();
  sent = [];
  failWith = null;
  fileIds = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = String(url).split("/").pop()!;
    const form = init?.body as FormData;
    sent.push({ method, chat: String(form.get("chat_id")), document: String(form.get("document")) });
    if (failWith) return Response.json({ ok: false, error_code: 403, description: failWith });
    return Response.json({ ok: true, result: { message_id: 1, chat: { id: 7, type: "private" }, document: { file_id: `tg-file-${++fileIds}` } } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function initData(telegramId: number) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: telegramId, first_name: "A" }) };
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update("tg-token").digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") }).toString();
}

let telegramId = 100;
/** A signed-in student with Telegram linked, a fresh Telegram id each time (the dedupe is per chat and file). */
async function student() {
  const id = ++telegramId;
  await db().insert(users).values({ email: `s${id}@newuu.uz`, telegramId: String(id) });
  return id;
}
const call = (body: unknown) =>
  POST(new Request("https://x/api/telegram/send-file", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const addFile = (id: string, size = 1000) =>
  db().insert(lmsFiles).values({ id, courseId: "101", code: "MATH111", lessonId: "L1", name: `${id}.pdf`, extension: "pdf", version: "1", storageKey: "k", size });

describe("POST /api/telegram/send-file", () => {
  it("sends the branded copy into the student's chat and remembers Telegram's file id", async () => {
    await addFile("SF1");
    const chat = await student();
    const response = await call({ id: "SF1", initData: initData(chat) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sent).toEqual([{ method: "sendDocument", chat: String(chat), document: "https://bucket.test/SF1.pdf" }]);
    const keys = (await db().select().from(telegramFiles)).map((r) => [r.key.replace(/^cover\d+:/, ""), r.fileId]);
    expect(keys).toEqual([["lms:SF1:1", "tg-file-1"]]);

    // Another student gets the cached file id: no upload.
    const other = await student();
    expect((await call({ id: "SF1", initData: initData(other) })).status).toBe(200);
    expect(sent[1]).toEqual({ method: "sendDocument", chat: String(other), document: "tg-file-1" });
  });

  it("a double tap inside 10 s sends once; after that it sends again", async () => {
    await addFile("SF2");
    const chat = await student();
    const [a, b] = await Promise.all([call({ id: "SF2", initData: initData(chat) }), call({ id: "SF2", initData: initData(chat) })]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect((await call({ id: "SF2", initData: initData(chat) })).status).toBe(200);
    expect(sent).toHaveLength(1);

    vi.useFakeTimers({ now: Date.now() + 11_000, toFake: ["Date"] });
    expect((await call({ id: "SF2", initData: initData(chat) })).status).toBe(200);
    expect(sent).toHaveLength(2);
  });

  it("403 no_access when the student never pressed Start or blocked the bot, and a retry is not swallowed", async () => {
    await addFile("SF3");
    const chat = await student();
    failWith = "Forbidden: bot can't initiate conversation with a user";
    const response = await call({ id: "SF3", initData: initData(chat) });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "no_access" });
    expect(sent).toHaveLength(1);

    // They press Start and tap Download again at once: this one really sends.
    failWith = null;
    expect((await call({ id: "SF3", initData: initData(chat) })).status).toBe(200);
    expect(sent).toHaveLength(2);
  });

  it("413 too_big for files over the bot's 50 MB upload limit, without calling Telegram", async () => {
    await addFile("SF4", 60 * 1024 * 1024);
    const response = await call({ id: "SF4", initData: initData(await student()) });
    expect(response.status).toBe(413);
    expect(sent).toEqual([]);
  });

  it("needs valid initData, a known file, and a linked student for LMS files", async () => {
    await addFile("SF5");
    expect((await call({ id: "SF5", initData: "user=%7B%22id%22%3A1%7D&hash=00" })).status).toBe(401);
    expect((await call("not json")).status).toBe(401);
    expect((await call({ id: "NOPE", initData: initData(await student()) })).status).toBe(404);
    expect((await call({ id: "SF5", initData: initData(999_999) })).status).toBe(403);
    expect(sent).toEqual([]);
  });
});
