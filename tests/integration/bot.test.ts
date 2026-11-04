import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage", () => ({ putObject: vi.fn(async (key: string) => key), signedUrl: vi.fn(async () => "https://files.test/x"), objectExists: vi.fn(async () => true) }));
const pending: Array<() => Promise<unknown>> = [];
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (task: () => Promise<unknown>) => { pending.push(task); } }));

import { createHmac } from "node:crypto";
import { POST as sendFile } from "@/app/api/telegram/send-file/route";
import { POST } from "@/app/api/telegram/files/route";
import { db } from "@/lib/db";
import { botChats, lmsCache, lmsCourses, lmsFiles, telegramFiles, uploads, userRoles, users } from "@/lib/db/schema";
import { notifyUploader } from "@/lib/telegram/notify";
import { publish as publishUpload, reject as rejectUpload, submitUpload } from "@/server/uploads";
import { resetDb } from "../fixtures/db";

type Sent = { method: string; body: Record<string, unknown> };
let sent: Sent[];
const methods = () => sent.map((item) => item.method);

function stubTelegram() {
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/file/bot")) return new Response(`bytes of ${url}`);
    const method = url.split("/").pop()!;
    const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : JSON.parse(String(init?.body ?? "{}"));
    sent.push({ method, body });
    if (method === "getFile") return Response.json({ ok: true, result: { file_path: `${body.file_id}.pdf` } });
    if (method === "sendDocument") return Response.json({ ok: true, result: { message_id: 500, chat: { id: 1, type: "private" }, document: { file_id: "tg-sent", file_unique_id: "s" } } });
    return Response.json({ ok: true, result: { message_id: 500, chat: { id: 1, type: "private" } } });
  }));
}

const post = (update: object, secret = "hook-secret") => POST(new Request("https://x/api/telegram/files", {
  method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ update_id: 1, ...update }),
}));

const doc = (extra: object = {}, chat = { id: 7, type: "private" }) => ({
  message: { message_id: 1, chat, from: { id: 7 }, caption: "from the group", document: { file_id: "f1", file_unique_id: "u1", file_name: "paper.pdf", mime_type: "application/pdf", file_size: 1000, ...extra } },
});

/** Runs the work the webhook left for after its answer. `roll` fixes the trusted spot-check dice. */
const settle = async (roll?: number) => {
  if (roll !== undefined) vi.spyOn(Math, "random").mockReturnValue(roll);
  while (pending.length) await pending.shift()!();
};

beforeEach(async () => { await resetDb(); stubTelegram(); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.restoreAllMocks(); });

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

const linkUser = async (telegramId = "7") => {
  const [user] = await db().insert(users).values({ email: "student@newuu.uz", telegramId }).returning();
  await db().insert(lmsCourses).values([
    { id: "11", code: "MATH111", name: "Calculus 1", raw: {} },
    { id: "12", code: "PHYS101", name: "Physics 1", raw: {} },
    { id: "13", code: "HIST100", name: "World History", raw: {} },
  ]);
  await db().insert(lmsCache).values({ userId: user.id, data: {
    enrollment: { semesterName: "Fall 2026", codes: ["MATH111", "PHYS101"], courses: [{ code: "MATH111", subject: "Calculus 1" }, { code: "PHYS101", subject: "Physics 1" }] },
    timetable: [], profile: { name: "Shamsiddin Abdurakhimov", email: "student@newuu.uz", gpa: null, ectsEarned: null, ectsTotal: null, honors: false, semesters: [] },
  } });
  return user;
};
const say = (text: string) => post({ message: { message_id: 2, chat: { id: 7, type: "private" }, from: { id: 7 }, text } });
const tap = (data: string, messageId = 500) => post({ callback_query: { id: "cb", from: { id: 7 }, data, message: { message_id: messageId, chat: { id: 7, type: "private" } } } });
const keyboard = () => {
  const markup = [...sent].reverse().find((item) => item.method === "sendMessage" && item.body.reply_markup)!.body.reply_markup as { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
  return markup.inline_keyboard.flat();
};
const press = async (label: string) => {
  const button = keyboard().find((b) => b.text === label || b.text === `✓ ${label}`);
  if (!button) throw new Error(`No button ${label} in ${keyboard().map((b) => b.text).join(", ")}`);
  await tap(button.callback_data);
};
const messages = () => sent.filter((item) => item.method === "sendMessage").map((item) => String(item.body.text));

describe("first contact", () => {
  it("welcomes with the Open Press F button (9.5)", async () => {
    await say("/start");
    expect(sent[0].method).toBe("sendMessage");
    expect(String(sent[0].body.text)).toMatch(/^<b>Hi! I'm Press F\.<\/b>/);
    expect(JSON.stringify(sent[0].body.reply_markup)).toContain('"text":"Open Press F"');
  });
  it("asks people who are not signed in to open Press F first, even with a file", async () => {
    await post(doc());
    expect(messages()[0]).toContain("Hi! I'm Press F.");
    expect(await db().select().from(botChats)).toEqual([]);
  });
  it("passes startapp codes through to the page", async () => {
    await say("/start c_MATH111");
    expect(JSON.parse(JSON.stringify(sent[0].body.reply_markup)).inline_keyboard[0][0].web_app.url).toBe("https://pressf.test/c/MATH111");
  });
  it("still opens old course links", async () => {
    await say("/start course_MATH111");
    expect(JSON.parse(JSON.stringify(sent[0].body.reply_markup)).inline_keyboard[0][0].web_app.url).toMatch(/\/courses\/MATH111$/);
  });
});

describe("sharing a file", () => {
  beforeEach(async () => { await linkUser(); });

  it("takes a deep-linked file through every step into an upload (11.1–11.5)", async () => {
    await say("/start upload_MATH111");
    expect(messages()).toEqual(["Send me the file and I'll ask where it goes."]);
    await post(doc({ file_name: "calc1_midterm_2026.pdf" }));
    expect(messages().at(-1)).toBe("<b>Got it. Which course is it for?</b>\nYou opened this from Calculus 1, so it's picked.");
    expect(keyboard().map((b) => b.text)).toEqual(["✓ Calculus 1", "Physics 1", "Another course…"]);

    await press("Calculus 1");
    expect(sent.find((item) => item.method === "editMessageText")!.body.text).toContain("<b>Calculus 1 ✓</b>");
    expect(messages().at(-1)).toBe("<b>What is it?</b>");
    await press("Past exam");
    expect(messages().at(-1)).toBe("<b>Which exam and semester?</b>");
    await press("Midterm");
    await press("Fall 2026");
    expect(messages().at(-1)).toContain("Show your name on it?");
    expect(keyboard().map((b) => b.text)).toEqual(["✓ Keep me anonymous", "Show 'Shamsiddin A.'"]);
    await press("Keep me anonymous");
    expect(messages().at(-1)).toContain("<b>Midterm exam, Fall 2026</b>\nCalculus 1 · past exam · from students");

    await press("Send for review");
    expect(methods()).not.toContain("getFile"); // the download waits until after the webhook answered
    await settle();
    const [row] = await db().select().from(uploads);
    expect(row).toMatchObject({ courseId: "11", courseCode: "MATH111", title: "Midterm exam, Fall 2026", type: "exam", exam: "midterm", term: "Fall 2026", status: "waiting", showName: false, fileName: "calc1_midterm_2026.pdf", telegramFileId: "f1" });
    expect(row.sha256).toHaveLength(64);
    expect(row.storageKey).toMatch(/^uploads\//);
    expect(methods()).toContain("getFile");
    expect(messages().at(-1)).toBe("<b>Sent for review ✓</b>\nA moderator checks it, usually within a day.");
    expect(await db().select().from(botChats)).toEqual([]);
  });

  it("finds another course by name and skips exam questions for notes", async () => {
    await post(doc({ file_name: "summary.pdf" }));
    await press("Another course…");
    expect(messages().at(-1)).toContain("Which course?");
    await say("history");
    expect(keyboard().map((b) => b.text)).toEqual(["World History", "Another course…"]);
    await press("World History");
    await press("Notes");
    await press("Show 'Shamsiddin A.'");
    expect(messages().at(-1)).toContain("World History · notes · from Shamsiddin A.");
    await press("Send for review");
    await settle();
    expect((await db().select().from(uploads))[0]).toMatchObject({ courseId: "13", type: "notes", title: "Summary", showName: true, exam: null });
  });

  it("goes live at once for trusted uploaders, with the course button", async () => {
    const [user] = await db().select().from(users);
    await db().insert(userRoles).values({ userId: user.id, manualTrust: "trusted" });
    await post(doc({ file_name: "lecture 5.pdf" }));
    await press("Calculus 1");
    await press("Lecture");
    await press("Keep me anonymous");
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await press("Send for review");
    await settle();
    expect(messages().at(-1)).toMatch(/^<b>Your file is live 🎉<\/b>/);
    expect(JSON.stringify(sent.at(-1)!.body.reply_markup)).toContain("Open in Calculus 1");
  });

  it("says when the same file is already there", async () => {
    const share = async () => {
      await post(doc({ file_name: "notes.pdf" }));
      await press("Calculus 1");
      await press("Notes");
      await press("Keep me anonymous");
      await press("Send for review");
      await settle();
    };
    await share();
    await share();
    expect(messages().at(-1)).toContain("Already on Press F");
    expect(await db().select().from(uploads)).toHaveLength(1);
  });

  it("refuses paused accounts before asking anything", async () => {
    const [user] = await db().select().from(users);
    await db().insert(userRoles).values({ userId: user.id, manualTrust: "paused" });
    await post(doc());
    expect(messages()).toEqual([expect.stringContaining("Sharing is paused")]);
  });

  it("takes photos too, and refuses files over the Telegram limit", async () => {
    await post({ message: { message_id: 3, chat: { id: 7, type: "private" }, from: { id: 7 }, photo: [{ file_id: "p0", file_unique_id: "q0", width: 90, height: 90 }, { file_id: "p1", file_unique_id: "q1", width: 900, height: 900, file_size: 1000 }] } });
    expect(messages().at(-1)).toContain("Which course is it for?");
    expect(((await db().select().from(botChats))[0].draft as { file: { fileId: string } }).file.fileId).toBe("p1");
    await post(doc({ file_size: 21 * 1024 * 1024 }));
    expect(messages().at(-1)).toContain("too big");
  });

  it("cancels, and turns away buttons of a dropped draft", async () => {
    await post(doc());
    const stale = keyboard()[0].callback_data;
    await say("/cancel");
    expect(messages().at(-1)).toBe("Cancelled. Send a file any time.");
    sent = [];
    await tap(stale);
    expect(sent[0]).toMatchObject({ method: "answerCallbackQuery", body: { text: "That one timed out. Send the file again." } });
  });

  it("drops a draft after a day", async () => {
    await post(doc());
    const stale = keyboard()[0].callback_data;
    await db().update(botChats).set({ updatedAt: new Date(Date.now() - 25 * 3600_000) });
    sent = [];
    await tap(stale);
    expect(sent[0].body.text).toMatch(/timed out/);
  });

  it("limits one sender to 20 files an hour", async () => {
    const [user] = await db().select().from(users);
    await db().insert(uploads).values(Array.from({ length: 20 }, (_, i) => ({ uploaderId: user.id, courseId: "11", title: "x", type: "notes", fileName: "x.pdf", mimeType: "a", size: 1, sha256: `s${i}` })));
    await post(doc());
    expect(messages().at(-1)).toContain("a lot of files");
  });

  it("ignores files posted in groups", async () => {
    await post(doc({}, { id: -5, type: "group" }));
    expect(sent).toEqual([]);
  });
});

describe("review outcome", () => {
  it("tells the uploader with a button to the course", async () => {
    const user = await linkUser();
    const out = await submitUpload({ uploaderId: user.id, courseId: "11", courseCode: "MATH111", title: "Midterm exam, Fall 2026", type: "exam", fileName: "a.pdf", mimeType: "application/pdf", size: 1, sha256: "x" });
    const { upload, message } = await publishUpload(out.duplicate ? "" : out.upload.id, user.id, {}, "Calculus 1");
    expect(await notifyUploader(upload.id, message)).toBe(true);
    expect(sent[0].body.chat_id).toBe("7");
    expect(String(sent[0].body.text)).toMatch(/^<b>Your file is live 🎉<\/b>\nMidterm exam, Fall 2026 · Calculus 1/);
    expect(JSON.parse(JSON.stringify(sent[0].body.reply_markup)).inline_keyboard[0][0]).toEqual({ text: "Open in Calculus 1", web_app: { url: "https://pressf.test/c/MATH111/files" } });
  });
  it("says Got it under a rejection and clears the button when pressed", async () => {
    const user = await linkUser();
    const out = await submitUpload({ uploaderId: user.id, courseId: "12", courseCode: "PHYS101", title: "Notes", type: "notes", fileName: "a.pdf", mimeType: "application/pdf", size: 1, sha256: "y" });
    const { upload, message } = await rejectUpload(out.duplicate ? "" : out.upload.id, user.id, "in-lms", "", "Physics 1");
    await notifyUploader(upload.id, message);
    expect(String(sent[0].body.text)).toMatch(/^<b>Not accepted: Notes<\/b>\nReason: /);
    sent = [];
    await tap("ok");
    expect(methods()).toEqual(["answerCallbackQuery", "editMessageReplyMarkup"]);
  });
  it("returns false when the uploader has no Telegram", async () => {
    const [user] = await db().insert(users).values({ email: "x@newuu.uz" }).returning();
    const out = await submitUpload({ uploaderId: user.id, courseId: "11", title: "t", type: "notes", fileName: "a.pdf", mimeType: "a", size: 1, sha256: "z" });
    expect(await notifyUploader(out.duplicate ? "" : out.upload.id, "Your file is live")).toBe(false);
  });
});

describe("old deep links", () => {
  it("answers such a link with a button to the page", async () => {
    await post({ message: { message_id: 1, chat: { id: 7, type: "private" }, text: "/start course_MATH111" } });
    const button = JSON.parse(JSON.stringify(sent.at(-1)!.body.reply_markup)).inline_keyboard[0][0];
    expect(button.web_app.url).toMatch(/\/courses\/MATH111$/);
  });
});

describe("sending a file to the mini app user", () => {
  const signed = (id: number) => {
    const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id }) };
    const check = Object.entries(fields).map(([key, value]) => `${key}=${value}`).sort().join("\n");
    const secret = createHmac("sha256", "WebAppData").update("tg-token").digest();
    return new URLSearchParams({ ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") }).toString();
  };
  const ask = (id: string, initData: string) => sendFile(new Request("https://x/api/telegram/send-file", { method: "POST", body: JSON.stringify({ id, initData }) }));
  const publish = async (extra: object = {}) => (await db().insert(uploads).values({ courseId: "11", courseCode: "MATH111", title: "Calculus 1 Final", type: "exam", status: "live", fileName: "Calculus 1 Final.pdf", mimeType: "application/pdf", size: 1000, sha256: "h", storageKey: "uploads/a.pdf", ...extra }).returning())[0];

  it("refuses forged launch data", async () => {
    const file = await publish();
    expect((await ask(file.id, "user=1&hash=00")).status).toBe(401);
    expect(sent).toEqual([]);
  });
  it("sends a published file to the signed user", async () => {
    const file = await publish();
    expect((await ask(file.id, signed(77))).status).toBe(200);
    expect(sent[0]).toMatchObject({ method: "sendDocument", body: { chat_id: "77", document: "https://files.test/x" } });
  });
  it("links to the public site, not the address behind the proxy", async () => {
    const file = await publish();
    await ask(file.id, signed(77));
    const button = JSON.parse(String(sent[0].body.reply_markup)).inline_keyboard[0][0];
    expect(button.web_app.url).toBe(`${process.env.NEXTAUTH_URL}/c/MATH111/files`);
    expect(button.url).toBeUndefined();
  });
  it("uploads the file when Telegram cannot fetch it by URL", async () => {
    const file = await publish();
    const real = fetch;
    let tries = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/sendDocument") && ++tries === 1) return Response.json({ ok: false, description: "Bad Request: failed to get HTTP URL content" });
      if (String(url) === "https://files.test/x") return new Response("pdf");
      return real(url, init);
    }));
    expect((await ask(file.id, signed(77))).status).toBe(200);
    expect(sent.at(-1)!.body.document).toBeInstanceOf(File);
  });
  it("reuses Telegram's copy on the next send", async () => {
    const file = await publish();
    await db().insert(telegramFiles).values({ key: `cover1:n2:upload:${file.id}`, fileId: "kept-id" });
    await ask(file.id, signed(77));
    expect(sent[0].body.document).toBe("kept-id");
  });
  it("never resends a copy remembered before files got a cover", async () => {
    const file = await publish();
    await db().insert(telegramFiles).values({ key: `upload:${file.id}`, fileId: "original-id" });
    await ask(file.id, signed(77));
    expect(sent[0].body.document).not.toBe("original-id");
  });
  it("asks for access when the bot may not write", async () => {
    const file = await publish();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, description: "Forbidden: bots can't send messages to bots" })));
    expect(await (await ask(file.id, signed(77))).json()).toEqual({ error: "no_access" });
  });
  it("hides files under review", async () => {
    const file = await publish({ status: "waiting" });
    expect((await ask(file.id, signed(77))).status).toBe(404);
  });
  it("says when a file is too big for a bot", async () => {
    const file = await publish({ size: 60 * 1024 * 1024 });
    expect(await (await ask(file.id, signed(77))).json()).toEqual({ error: "too_big" });
  });

  it("sends a live student upload once, then reuses Telegram's copy", async () => {
    const [up] = await db().insert(uploads).values({ courseId: "11", courseCode: "MATH111", title: "Midterm exam, Fall 2026", type: "exam", status: "live", fileName: "a.pdf", mimeType: "application/pdf", size: 1000, sha256: "h", storageKey: "uploads/h-pressf.pdf" }).returning();
    expect((await ask(up.id, signed(77))).status).toBe(200);
    expect(sent[0].body.document).toBe("https://files.test/x");
    expect((await db().select().from(telegramFiles))[0]).toMatchObject({ key: `cover1:n2:upload:${up.id}`, fileId: "tg-sent" });
    sent = [];
    await ask(up.id, signed(78));
    expect(sent[0].body.document).toBe("tg-sent");
  });
  it("sends LMS files only to signed-in students", async () => {
    await db().insert(lmsFiles).values({ id: "m1", courseId: "11", code: "MATH111", name: "Week 3_L5.pdf", extension: "pdf", version: "1", storageKey: "lms/m1.pdf", size: 1000 });
    expect(await (await ask("m1", signed(77))).json()).toEqual({ error: "sign_in" });
    await db().insert(users).values({ email: "s@newuu.uz", telegramId: "77" });
    expect((await ask("m1", signed(77))).status).toBe(200);
    expect((await db().select().from(telegramFiles))[0].key).toBe("cover1:n2:lms:m1:1");
  });
});
