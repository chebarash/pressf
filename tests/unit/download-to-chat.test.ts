import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadToChat } from "@/platform/native";

type App = Record<string, any>;
let calls: string[];
let fetches: Array<{ url: string; body: any }>;
let answer: { status: number; body: object };
let pressed: string;

/** A Telegram 8.0 WebApp recording every call; popups answer with `pressed`. */
function telegram(): App {
  return {
    initData: "signed",
    version: "8.0",
    isVersionAtLeast: () => true,
    openTelegramLink: (url: string) => calls.push(`link ${url}`),
    close: () => calls.push("close"),
    downloadFile: (p: { url: string; file_name: string }, cb: (ok: boolean) => void) => { calls.push(`download ${p.url} ${p.file_name}`); cb(true); },
    showPopup: (p: { message: string }, cb: (id: string) => void) => { calls.push(`popup ${p.message}`); cb(pressed); },
    HapticFeedback: { notificationOccurred: (t: string) => calls.push(`haptic ${t}`) },
  };
}

function stub(app: App | null) {
  const anchor = { click: () => calls.push(`anchor ${anchor.href} ${anchor.download}`), remove: () => {}, href: "", download: "", rel: "" };
  vi.stubGlobal("document", { documentElement: { classList: { contains: (c: string) => c === "tg" && !!app } }, createElement: () => anchor, body: { append: () => {} } });
  vi.stubGlobal("window", { Telegram: app ? { WebApp: app } : undefined, open: (url: string) => calls.push(`tab ${url}`) });
  vi.stubGlobal("location", { href: "https://pressf.chebarash.uz/f/F1" });
}

beforeEach(() => {
  calls = [];
  fetches = [];
  answer = { status: 200, body: { ok: true } };
  pressed = "ok";
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    fetches.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    return Response.json(answer.body, { status: answer.status });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const LINK = "/f/F1/download?sig=abc";
const SENT = "popup Sent to your chat with @pressfapp.";

describe("Download picks the bot or a download by platform", () => {
  it("outside Telegram: a plain download, no bot call", async () => {
    stub(null);
    expect(await downloadToChat("F1", LINK, "Week 8.pdf")).toBe("download");
    expect(fetches).toEqual([]);
    expect(calls).toEqual(["anchor https://pressf.chebarash.uz/f/F1/download?sig=abc Week 8.pdf"]);
  });

  it("in the Mini App: the bot sends it, a popup says so, the page stays", async () => {
    stub(telegram());
    const settled = vi.fn();
    expect(await downloadToChat("F1", LINK, "Week 8.pdf", settled)).toBe("chat");
    expect(fetches).toEqual([{ url: "/api/telegram/send-file", body: { id: "F1", initData: "signed" } }]);
    expect(settled).toHaveBeenCalledOnce();
    expect(calls).toEqual(["haptic success", SENT]);
  });

  it("Open chat opens the bot's chat (and closes the Mini App so it shows)", async () => {
    pressed = "open";
    stub(telegram());
    await downloadToChat("F2", LINK, "a.pdf");
    vi.advanceTimersByTime(200);
    expect(calls).toEqual(["haptic success", SENT, "link https://t.me/pressfapp", "close"]);
  });

  it("a second tap inside 10 s does nothing; later it sends again", async () => {
    stub(telegram());
    const [a, b] = await Promise.all([downloadToChat("F3", LINK, "a.pdf"), downloadToChat("F3", LINK, "a.pdf")]);
    expect([a, b]).toEqual(["chat", "busy"]);
    expect(await downloadToChat("F3", LINK, "a.pdf")).toBe("busy");
    expect(fetches).toHaveLength(1);
    vi.advanceTimersByTime(10_001);
    expect(await downloadToChat("F3", LINK, "a.pdf")).toBe("chat");
    expect(fetches).toHaveLength(2);
  });

  it("the bot can't write to them (403): download instead, then ask them to press Start", async () => {
    answer = { status: 403, body: { error: "no_access" } };
    pressed = "later";
    stub(telegram());
    expect(await downloadToChat("F4", LINK, "a.pdf")).toBe("download");
    expect(calls).toEqual([
      "download https://pressf.chebarash.uz/f/F1/download?sig=abc a.pdf",
      "popup Press Start in @pressfapp and next time Download sends the file straight to your chat.",
    ]);
    // A failed send doesn't block the next tap.
    answer = { status: 200, body: { ok: true } };
    expect(await downloadToChat("F4", LINK, "a.pdf")).toBe("chat");
  });

  it("too big, not linked, or the request failing: just the download", async () => {
    stub(telegram());
    for (const [i, a] of [{ status: 413, body: { error: "too_big" } }, { status: 403, body: { error: "sign_in" } }, { status: 502, body: { error: "failed" } }].entries()) {
      answer = a;
      calls = [];
      expect(await downloadToChat(`F5${i}`, LINK, "a.pdf")).toBe("download");
      expect(calls).toEqual(["download https://pressf.chebarash.uz/f/F1/download?sig=abc a.pdf"]);
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    calls = [];
    expect(await downloadToChat("F6", LINK, "a.pdf")).toBe("download");
    expect(calls).toEqual(["download https://pressf.chebarash.uz/f/F1/download?sig=abc a.pdf"]);
  });
});
