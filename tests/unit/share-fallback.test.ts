import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shareTarget, uploadViaBot, openTelegramLink } from "@/platform/native";

type App = Record<string, any>;
let calls: string[];
let fetches: Array<{ url: string; body: any }>;
let prepareOk: boolean;

/** A Telegram WebApp of the given version, recording every call. */
function telegram(version: string, extra: Partial<App> = {}): App {
  const [major, minor] = version.split(".").map(Number);
  const atLeast = (v: string) => {
    const [m, n] = v.split(".").map(Number);
    return major > m || (major === m && minor >= n);
  };
  return {
    initData: "x",
    version,
    isVersionAtLeast: atLeast,
    openTelegramLink: (url: string) => calls.push(`link ${url}`),
    close: () => calls.push("close"),
    switchInlineQuery: (q: string, types: string[]) => calls.push(`inline ${q} ${types.join(",")}`),
    shareMessage: (id: string, cb: (sent: boolean) => void) => { calls.push(`shareMessage ${id}`); cb(true); },
    ...extra,
  };
}

function stub(app: App | null, nav: Partial<Navigator> = {}) {
  vi.stubGlobal("document", { documentElement: { classList: { contains: (c: string) => c === "tg" && !!app } } });
  vi.stubGlobal("window", { Telegram: app ? { WebApp: app } : undefined, open: (url: string) => calls.push(`tab ${url}`) });
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("location", { href: "https://pressf.chebarash.uz/" });
}

beforeEach(() => {
  calls = [];
  fetches = [];
  prepareOk = true;
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    fetches.push({ url, body });
    if (url === "/api/telegram/share" && !body.sent) return prepareOk ? Response.json({ id: "prep1", receipt: "r1" }) : Response.json({ error: "failed" }, { status: 502 });
    if (url === "/api/telegram/upload") return prepareOk ? Response.json({ ok: true }) : Response.json({ error: "no_access" }, { status: 403 });
    return Response.json({ ok: true });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const course = { to: "course" as const, code: "MATH111" };

describe("shareTarget fallback order", () => {
  it("8.0+: prepared message through shareMessage, then counts the sent share", async () => {
    stub(telegram("8.0"));
    expect(await shareTarget(course, "Calculus 1")).toBe("prepared");
    expect(fetches[0]).toEqual({ url: "/api/telegram/share", body: { kind: "course", id: "MATH111", initData: "x" } });
    expect(calls).toEqual(["shareMessage prep1"]);
    await vi.waitFor(() => expect(fetches[1]).toEqual({ url: "/api/telegram/share", body: { sent: "r1" } }));
  });

  it("does not count a share the user closed", async () => {
    stub(telegram("8.0", { shareMessage: (id: string, cb: (sent: boolean) => void) => { calls.push(`shareMessage ${id}`); cb(false); } }));
    await shareTarget({ to: "file", id: "F1" });
    expect(fetches).toEqual([{ url: "/api/telegram/share", body: { kind: "file", id: "F1", initData: "x" } }]);
  });

  it("8.0+ but the server can't prepare: inline mode", async () => {
    prepareOk = false;
    stub(telegram("8.0"));
    expect(await shareTarget(course)).toBe("inline");
    expect(calls).toEqual(["inline c_MATH111 users,groups,channels"]);
  });

  it("6.7–7.x: inline mode without asking the server", async () => {
    stub(telegram("7.10", { shareMessage: undefined }));
    expect(await shareTarget({ to: "professor", id: "g-pinto" })).toBe("inline");
    expect(calls).toEqual(["inline p_g-pinto users,groups,channels"]);
    expect(fetches).toEqual([]);
  });

  it("older Telegram (or inline mode throwing): the t.me/share link", async () => {
    stub(telegram("6.1"));
    expect(await shareTarget(course, "Calculus 1")).toBe("link");
    expect(calls).toEqual(["link https://t.me/share/url?url=https%3A%2F%2Fpressf.chebarash.uz%2Fc%2FMATH111&text=Calculus%201"]);
    calls = [];
    stub(telegram("7.0", { switchInlineQuery: () => { throw new Error("WebAppInlineModeDisabled"); } }));
    expect(await shareTarget(course)).toBe("link");
  });

  it("outside Telegram: system share sheet, then copy, then a new tab", async () => {
    const share = vi.fn(async () => {});
    stub(null, { share } as Partial<Navigator>);
    expect(await shareTarget(course, "Calculus 1")).toBe("web-share");
    expect(share).toHaveBeenCalledWith({ url: "https://pressf.chebarash.uz/c/MATH111", text: "Calculus 1" });

    const writeText = vi.fn(async () => {});
    stub(null, { clipboard: { writeText } } as unknown as Partial<Navigator>);
    expect(await shareTarget(course)).toBe("copy");
    expect(writeText).toHaveBeenCalledWith("https://pressf.chebarash.uz/c/MATH111");

    stub(null);
    expect(await shareTarget(course)).toBe("tab");
    expect(calls.at(-1)).toBe("tab https://t.me/share/url?url=https%3A%2F%2Fpressf.chebarash.uz%2Fc%2FMATH111");
    expect(fetches).toEqual([]);
  });
});

describe("share a file via the bot", () => {
  it("the bot writes the prompt, then the chat opens and the Mini App closes", async () => {
    stub(telegram("8.0"));
    expect(await uploadViaBot("MATH111")).toBe("sent");
    expect(fetches[0]).toEqual({ url: "/api/telegram/upload", body: { code: "MATH111" } });
    vi.runAllTimers();
    expect(calls).toEqual(["link https://t.me/pressfapp", "close"]);
  });

  it("falls back to the start link (and still closes) when the bot can't write", async () => {
    prepareOk = false;
    stub(telegram("8.0"));
    expect(await uploadViaBot("MATH111")).toBe("link");
    vi.runAllTimers();
    expect(calls).toEqual(["link https://t.me/pressfapp?start=upload_MATH111", "close"]);
  });

  it("outside Telegram: the start link in a new tab", async () => {
    stub(null);
    expect(await uploadViaBot("MATH111")).toBe("tab");
    expect(calls).toEqual(["tab https://t.me/pressfapp?start=upload_MATH111"]);
  });

  it("other t.me links keep the Mini App open; the bot's own chat closes it", () => {
    stub(telegram("8.0"));
    openTelegramLink("https://t.me/pressfapp?startapp=c_MATH111");
    openTelegramLink("https://t.me/somechannel");
    openTelegramLink("https://t.me/pressfapp");
    vi.runAllTimers();
    expect(calls).toEqual(["link https://t.me/pressfapp?startapp=c_MATH111", "link https://t.me/somechannel", "link https://t.me/pressfapp", "close"]);
  });
});
