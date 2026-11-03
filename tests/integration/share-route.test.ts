import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({ current: null as null | { id: string; email: string; isAdmin: boolean } }));
vi.mock("@/lib/auth", async (original) => ({
  ...(await original<typeof import("@/lib/auth")>()),
  getUser: async () => user.current,
}));

import { createHmac } from "node:crypto";
import { POST as share } from "@/app/api/telegram/share/route";
import { POST as upload } from "@/app/api/telegram/upload/route";
import { db } from "@/lib/db";
import { searchEvents, users } from "@/lib/db/schema";
import { readReceipt, signReceipt } from "@/lib/telegram/miniapp";
import { resetSearchIndex } from "@/server/views/search";
import { resetDb, seedCatalog } from "../fixtures/db";

type Sent = { method: string; body: Record<string, any> };
let sent: Sent[];
let failWith: string | null;

beforeEach(async () => {
  await resetDb();
  await seedCatalog();
  resetSearchIndex();
  sent = [];
  failWith = null;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = String(url).split("/").pop()!;
    sent.push({ method, body: JSON.parse(String(init?.body ?? "{}")) });
    if (failWith) return Response.json({ ok: false, description: failWith });
    if (method === "savePreparedInlineMessage") return Response.json({ ok: true, result: { id: `prep${sent.length}`, expiration_date: Math.floor(Date.now() / 1000) + 3600 } });
    return Response.json({ ok: true, result: { message_id: 1, chat: { id: 7, type: "private" } } });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const signIn = async (telegramId: string | null = "7") => {
  const [row] = await db().insert(users).values({ email: `s${Math.random()}@newuu.uz`, telegramId }).returning();
  user.current = { id: row.id, email: row.email, isAdmin: false };
  return row;
};
const call = (route: typeof share, body: unknown) =>
  route(new Request("https://x/api/telegram/share", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const shares = async () => (await db().select().from(searchEvents)).map((r) => `${r.kind} ${r.targetId}`);

describe("POST /api/telegram/share", () => {
  it("needs a signed-in student with Telegram linked", async () => {
    user.current = null;
    expect((await call(share, { kind: "course", id: "MATH111" })).status).toBe(401);
    await signIn(null);
    expect((await call(share, { kind: "course", id: "MATH111" })).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it("rejects bad payloads", async () => {
    await signIn();
    for (const body of ["not json", { kind: "today", id: "x" }, { kind: "course" }, { kind: "course", id: "../etc" }, { kind: "file", id: "x".repeat(61) }, { sent: 5 }]) {
      expect((await call(share, body)).status).toBe(400);
    }
    expect((await call(share, { kind: "course", id: "NOPE999" })).status).toBe(404);
    expect(sent).toEqual([]);
  });

  it("prepares the inline card for the user and returns its id with a receipt", async () => {
    await signIn("7");
    const response = await call(share, { kind: "course", id: "MATH111" });
    expect(response.status).toBe(200);
    const { id, receipt } = await response.json();
    expect(sent.map((s) => s.method)).toEqual(["savePreparedInlineMessage"]);
    const body = sent[0].body;
    expect(body).toMatchObject({ user_id: 7, allow_user_chats: true, allow_group_chats: true, allow_channel_chats: true });
    expect(body.allow_bot_chats).toBeUndefined();
    // Same card as inline mode's answer to "c_MATH111".
    expect(body.result).toMatchObject({ type: "article", id: "c_MATH111", title: "Calculus 1 (MATH111)" });
    expect(body.result.reply_markup.inline_keyboard[0][0]).toEqual({ text: "Open in Press F", url: "https://t.me/pressfapp?startapp=c_MATH111" });
    expect(id).toBe("prep1");
    expect(readReceipt(receipt)).toEqual({ preparedId: "prep1", startParam: "c_MATH111" });
  });

  it("refuses when the Mini App runs in another Telegram account than the linked one", async () => {
    await signIn("7");
    const initData = (id: number) => {
      const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id }) };
      const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join("\n");
      const secret = createHmac("sha256", "WebAppData").update("tg-token").digest();
      return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") }).toString();
    };
    expect((await call(share, { kind: "course", id: "MATH111", initData: initData(9) })).status).toBe(409);
    expect((await call(share, { kind: "course", id: "MATH111", initData: "forged" })).status).toBe(409);
    expect(sent).toEqual([]);
    expect((await call(share, { kind: "course", id: "MATH111", initData: initData(7) })).status).toBe(200);
  });

  it("answers 502 when Telegram refuses", async () => {
    await signIn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    failWith = "Bad Request: user not found";
    expect((await call(share, { kind: "professor", id: "g-pinto" })).status).toBe(502);
  });

  it("counts a sent prepared message once, and only with a valid receipt", async () => {
    await signIn();
    const { receipt } = await (await call(share, { kind: "professor", id: "g-pinto" })).json();
    expect((await call(share, { sent: receipt })).status).toBe(200);
    expect((await call(share, { sent: receipt })).status).toBe(200);
    expect(await shares()).toEqual(["share:professor g-pinto"]);
    expect((await call(share, { sent: `${receipt.slice(0, -2)}xx` })).status).toBe(400);
    expect((await call(share, { sent: signReceipt("old", "c_MATH111", Math.floor(Date.now() / 1000) - 10) })).status).toBe(400);
    expect(await shares()).toEqual(["share:professor g-pinto"]);
  });

  it("rate-limits each student", async () => {
    await signIn();
    const codes: number[] = [];
    for (let i = 0; i < 22; i++) codes.push((await call(share, { kind: "course", id: "MATH111" })).status);
    expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    expect(codes.slice(20)).toEqual([429, 429]);
    // Another student is not affected.
    await signIn("8");
    expect((await call(share, { kind: "course", id: "MATH111" })).status).toBe(200);
  });
});

describe("POST /api/telegram/upload", () => {
  it("writes the upload prompt with the course picked into the student's chat", async () => {
    await signIn("7");
    expect((await call(upload, { code: "MATH111" })).status).toBe(200);
    const message = sent.find((s) => s.method === "sendMessage")!;
    expect(message.body.chat_id).toBe(7);
    expect(message.body.text).toBe("Send me the file and I'll ask where it goes.");
  });

  it("needs a linked student and a course code; 403 when the bot can't write to them", async () => {
    user.current = null;
    expect((await call(upload, { code: "MATH111" })).status).toBe(401);
    await signIn();
    expect((await call(upload, { code: "a b" })).status).toBe(400);
    vi.spyOn(console, "error").mockImplementation(() => {});
    failWith = "Forbidden: bot can't initiate conversation with a user";
    expect((await call(upload, { code: "MATH111" })).status).toBe(403);
  });
});
