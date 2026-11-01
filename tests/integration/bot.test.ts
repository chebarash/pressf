import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage", () => ({ putObject: vi.fn(async (key: string) => key), signedUrl: vi.fn(async () => "https://files.test/x") }));
vi.mock("@/lib/syllabus", async (original) => ({ ...(await original<typeof import("@/lib/syllabus")>()), extractSyllabus: vi.fn() }));

import { POST } from "@/app/api/telegram/files/route";
import { db } from "@/lib/db";
import { materials, syllabi } from "@/lib/db/schema";
import { extractSyllabus } from "@/lib/syllabus";
import { syllabus } from "../fixtures/catalog";
import { resetDb, seedCatalog } from "../fixtures/db";

type Sent = { method: string; body: Record<string, unknown> };
let sent: Sent[];
const methods = () => sent.map((item) => item.method);

function stubTelegram() {
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/file/bot")) return new Response("not a real pdf");
    const method = url.split("/").pop()!;
    const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(String(init?.body ?? "{}"));
    sent.push({ method, body });
    if (method === "getFile") return Response.json({ ok: true, result: { file_path: "a.pdf" } });
    return Response.json({ ok: true, result: { message_id: 500, chat: { id: 1, type: "private" } } });
  }));
}

const post = (update: object, secret = "hook-secret") => POST(new Request("https://x/api/telegram/files", {
  method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: 1, ...update }),
}));

const doc = (extra: object = {}, chat = { id: 7, type: "private" }) => ({
  message: { message_id: 1, chat, caption: "Calculus 1 midterm Fall 2023", document: { file_id: "f1", file_unique_id: "u1", file_name: "paper.pdf", mime_type: "application/pdf", file_size: 1000, ...extra } },
});
const press = (data: string, chat = -100) => ({ callback_query: { id: "cb", data, message: { message_id: 500, chat: { id: chat, type: "supergroup" } } } });
const lastText = () => String([...sent].reverse().find((item) => item.body.text || item.body.caption)?.body.text ?? [...sent].reverse().find((item) => item.body.caption)?.body.caption);
const only = async () => (await db().select().from(materials))[0];

beforeEach(async () => { await resetDb(); await seedCatalog(); stubTelegram(); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("webhook", () => {
  it("rejects a wrong secret", async () => {
    expect((await post(doc(), "nope")).status).toBe(401);
    expect(sent).toEqual([]);
  });
  it("answers 200 even when handling fails, so Telegram does not loop", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect((await post(doc())).status).toBe(200);
  });
});

describe("students", () => {
  it("greets with the branded picture and a link to the site", async () => {
    await post({ message: { message_id: 1, chat: { id: 7, type: "private" }, text: "/start" } });
    expect(sent[0].method).toBe("sendPhoto");
    expect(sent[0].body.photo).toBe("https://pressf.test/bot/welcome.png");
  });
  it("takes a file, guesses it and sends a card to the review group", async () => {
    await post(doc());
    expect(await only()).toMatchObject({ status: "pending", courseCode: "MATH111", type: "midterm", term: "Fall 2023", submitterChatId: "7", storageKey: null });
    expect(methods()).toEqual(["sendDocument", "sendMessage"]);
    expect(sent[0].body.chat_id).toBe("-100");
    expect((await only()).reviewMessageId).toBe(500);
  });
  it("refuses other file types and asks for files instead of photos", async () => {
    await post(doc({ file_name: "marks.xlsx" }));
    expect(lastText()).toMatch(/PDF, DOCX or PPTX/);
    await post({ message: { message_id: 2, chat: { id: 7, type: "private" }, photo: [{}] } });
    expect(lastText()).toMatch(/PDF, DOCX or PPTX/);
    expect(await db().select().from(materials)).toEqual([]);
  });
  it("refuses files over the Telegram limit", async () => {
    await post(doc({ file_size: 21 * 1024 * 1024 }));
    expect(lastText()).toMatch(/Over 20 MB/);
  });
  it("spots a duplicate", async () => {
    await post(doc());
    await post(doc());
    expect(lastText()).toMatch(/already have/);
    expect(await db().select().from(materials)).toHaveLength(1);
  });
  it("limits one sender to 20 files an hour", async () => {
    for (let i = 0; i < 20; i++) await db().insert(materials).values({ fileName: "x.pdf", mimeType: "a", size: 1, telegramFileUniqueId: `u${i + 10}`, submitterChatId: "7" });
    await post(doc());
    expect(lastText()).toMatch(/try again in an hour/);
  });
  it("ignores files posted in other groups", async () => {
    await post(doc({}, { id: -5, type: "group" }));
    expect(sent).toEqual([]);
  });
});

describe("review", () => {
  beforeEach(async () => { await post(doc()); sent = []; });

  it("publishes, forgets the sender and sends them to the course", async () => {
    const material = await only();
    await post(press(`approve:${material.id}`));
    const row = await only();
    expect(row.status).toBe("approved");
    expect(row.submitterChatId).toBeNull();
    expect(row.sha256).toHaveLength(64);
    expect(row.storageKey).toMatch(/^materials\//);
    const photo = sent.find((item) => item.method === "sendPhoto");
    expect(photo?.body.chat_id).toBe("7");
    expect(String(photo?.body.caption)).toContain("Respects paid");
    expect(JSON.stringify(photo?.body.reply_markup)).toContain("/courses/MATH111#files");
  });
  it("rejects and tells the sender without keeping their chat", async () => {
    const material = await only();
    await post(press(`reject:${material.id}`));
    expect(await only()).toMatchObject({ status: "rejected", submitterChatId: null });
    expect(sent.some((item) => item.body.chat_id === "7" && String(item.body.text).includes("not added"))).toBe(true);
  });
  it("does not act on buttons outside the review group", async () => {
    const material = await only();
    await post(press(`approve:${material.id}`, -999));
    expect((await only()).status).toBe("pending");
    expect(sent[0].body.text).toBe("Not allowed.");
  });
  it("needs a course and a type before publishing", async () => {
    const material = await only();
    await db().update(materials).set({ courseCode: null }).where(eq(materials.id, material.id));
    await post(press(`approve:${material.id}`));
    expect((await only()).status).toBe("pending");
  });
  it("does not review twice", async () => {
    const material = await only();
    await post(press(`reject:${material.id}`));
    sent = [];
    await post(press(`approve:${material.id}`));
    expect(sent[0].body.text).toBe("Already reviewed.");
  });
  it("catches the same bytes sent as another file", async () => {
    const first = await only();
    await post(press(`approve:${first.id}`));
    await post(doc({ file_unique_id: "u2", file_id: "f2" }));
    const second = (await db().select().from(materials).where(eq(materials.status, "pending")))[0];
    sent = [];
    await post(press(`approve:${second.id}`));
    expect((await db().select().from(materials).where(eq(materials.id, second.id)))[0].status).toBe("rejected");
  });
  it("fixes a card from a reply, changing only what the reply names", async () => {
    await post({ message: { message_id: 9, chat: { id: -100, type: "supergroup" }, text: "PHYS101 final", reply_to_message: { message_id: 500 } } });
    expect(await only()).toMatchObject({ courseCode: "PHYS101", courseName: "Physics 1", type: "final", term: "Fall 2023" });
    expect(sent[0].method).toBe("editMessageCaption");
  });
  it("reads a syllabus on publish and shows it only if it matches", async () => {
    vi.mocked(extractSyllabus).mockResolvedValue({ is_syllabus: true, ...syllabus() });
    const material = await only();
    await db().update(materials).set({ type: "syllabus", fileName: "s.pdf" }).where(eq(materials.id, material.id));
    await post(press(`approve:${material.id}`));
    expect((await db().select().from(syllabi))[0]).toMatchObject({ courseCode: "MATH111", matched: true, flags: [] });
  });
  it("still publishes when reading the syllabus fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(extractSyllabus).mockRejectedValue(new Error("no credit"));
    const material = await only();
    await db().update(materials).set({ type: "syllabus", fileName: "s.pdf" }).where(eq(materials.id, material.id));
    await post(press(`approve:${material.id}`));
    expect((await only()).status).toBe("approved");
  });
});

describe("moderator commands", () => {
  const command = (text: string) => post({ message: { message_id: 3, chat: { id: -100, type: "supergroup" }, text } });
  it("lists waiting files, also with the bot name attached", async () => {
    await post(doc());
    sent = [];
    await command("/pending@pupressfbot");
    expect(lastText()).toContain("paper.pdf");
  });
  it("says when nothing waits", async () => { await command("/pending"); expect(lastText()).toMatch(/Nothing is waiting/); });
  it("reports counts and the guide", async () => {
    await command("/stats");
    expect(lastText()).toContain("Published: 0");
    await command("/help");
    expect(lastText()).toContain("review desk");
  });
});
