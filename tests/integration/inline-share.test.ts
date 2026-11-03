import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/telegram/files/route";
import { db } from "@/lib/db";
import { lmsFiles, searchEvents } from "@/lib/db/schema";
import { ALLOWED_UPDATES } from "@/lib/telegram/api";
import { coursesPage, overview } from "@/server/admin/views";
import { feedViews } from "@/server/views/shared";
import { resetSearchIndex } from "@/server/views/search";
import { resetDb, seedCatalog } from "../fixtures/db";

type Sent = { method: string; body: Record<string, unknown> };
let sent: Sent[];

beforeEach(async () => {
  await resetDb();
  await seedCatalog();
  resetSearchIndex();
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = String(url).split("/").pop()!;
    sent.push({ method, body: JSON.parse(String(init?.body ?? "{}")) });
    return Response.json({ ok: true, result: true });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const post = (update: object) => POST(new Request("https://x/api/telegram/files", {
  method: "POST", headers: { "x-telegram-bot-api-secret-token": "hook-secret" }, body: JSON.stringify({ update_id: 1, ...update }),
}));
const results = () => (sent.find((s) => s.method === "answerInlineQuery")?.body.results ?? []) as Array<Record<string, any>>;

describe("inline mode", () => {
  it("asks Telegram for inline queries and chosen results", () => {
    expect(ALLOWED_UPDATES).toEqual(expect.arrayContaining(["inline_query", "chosen_inline_result", "message", "callback_query"]));
  });

  it("answers a Share button's query (c_CODE) with the course card and a Mini App button", async () => {
    await post({ inline_query: { id: "q1", from: { id: 7 }, query: "c_MATH111", offset: "" } });
    const [r] = results();
    expect(r.id).toBe("c_MATH111");
    expect(r.title).toBe("Calculus 1 (MATH111)");
    expect(r.thumbnail_url).toMatch(/^https:\/\/pressf\.chebarash\.uz\/og\/course-new\/MATH111\?v=/);
    expect(r.input_message_content.link_preview_options).toEqual({ url: "https://pressf.chebarash.uz/c/MATH111", prefer_large_media: true, show_above_text: true });
    expect(r.input_message_content.message_text).toContain("<b>Calculus 1 (MATH111)</b>");
    expect(r.reply_markup.inline_keyboard[0][0]).toEqual({ text: "Open in Press F", url: "https://t.me/pressfapp?startapp=c_MATH111" });
  });

  it("answers professors (p_ID) and free text with search results", async () => {
    await post({ inline_query: { id: "q2", from: { id: 7 }, query: "p_g-pinto", offset: "" } });
    expect(results()[0]).toMatchObject({ id: "p_g-pinto", title: "Gonçalo Pinto" });
    sent = [];
    await post({ inline_query: { id: "q3", from: { id: 7 }, query: "calculus", offset: "" } });
    expect(results().map((r) => r.id)).toEqual(expect.arrayContaining(["c_MATH111", "c_MATH211"]));
    // An empty query offers the app itself.
    sent = [];
    await post({ inline_query: { id: "q4", from: { id: 7 }, query: "", offset: "" } });
    expect(results()[0].id).toBe("today");
  });

  it("counts a sent result as a share and shows it in the admin", async () => {
    await post({ chosen_inline_result: { result_id: "c_MATH111", from: { id: 7 }, query: "c_MATH111" } });
    await post({ chosen_inline_result: { result_id: "c_MATH111", from: { id: 8 }, query: "calc" } });
    await post({ chosen_inline_result: { result_id: "p_g-pinto", from: { id: 8 }, query: "pinto" } });
    const rows = await db().select().from(searchEvents);
    expect(rows.map((r) => `${r.kind} ${r.targetId}`).sort()).toEqual(["share:course MATH111", "share:course MATH111", "share:professor g-pinto"]);
    const courses = await coursesPage("MATH111");
    expect(courses.courses.find((c) => c.code === "MATH111")?.shares).toBe(2);
    const o = await overview();
    expect(o.shares.total).toBe("3");
    expect(o.shares.top[0]).toMatchObject({ label: "Calculus 1 · MATH111", n: "2", href: "/c/MATH111" });
  });
});

describe("new files in the feed", () => {
  it("lists the files of a new-files item (titles, types, links) with the rest counted", async () => {
    await db().insert(lmsFiles).values([
      { id: "F1", courseId: "fixture-MATH111", code: "MATH111", name: "Week 8_Lecture 15 slides.pdf", extension: "pdf", storageKey: "k1" },
      { id: "F2", courseId: "fixture-MATH111", code: "MATH111", name: "Syllabus MATH111.pdf", extension: "pdf", storageKey: "k2" },
    ]);
    const item = {
      id: "files:fixture-MATH111:F1,F2,F3", kind: "file" as const, title: "5 new files in Calculus 1", body: "Week 8 · Lecture 15 slides, Syllabus and 3 more",
      courseId: "fixture-MATH111", courseName: "Calculus 1", at: new Date(), read: false, href: "/c/MATH111",
    };
    const [v] = await feedViews([item], new Date(), new Map());
    expect(v.title).toBe("5 new files in Calculus 1");
    expect(v.body).toBe("Week 8");
    expect(v.files?.shown.map((f) => [f.title, f.type, f.href])).toEqual([["Lecture 15 slides", "lecture", "/f/F1"], ["Syllabus", "syllabus", "/f/F2"]]);
    expect(v.files?.more).toBe(3);
    expect(v.files?.courseHref).toBe("/c/MATH111/files");
  });
});
