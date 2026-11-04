import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { cleanHints, HINTS, pickHint, type HintScreen } from "@/core/hints";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} }),
  usePathname: () => "/timetable",
  useSearchParams: () => new URLSearchParams(),
}));

const { HintsProvider } = await import("@/ui/shell/Hints");
const { TimetableScreen } = await import("@/screens/desktop/split/TimetableScreen");
const { default: PhoneTimetable } = await import("@/screens/mobile/Timetable");
const { SettingsScreen } = await import("@/screens/desktop/split/SettingsScreen");
const { default: PhoneSettings } = await import("@/screens/mobile/Settings");
const adapt = await import("@/screens/desktop/adapt");
const { timetableDemo } = await import("@/screens/mobile/demo-b");
const { profileDemo } = await import("@/screens/mobile/mc/demo");
const { lessonPanel } = await import("@/screens/shared/schedule/lesson");
const { NAV, NAV_VIEWS, navActive } = await import("@/ui/shell/nav");

const student = { signedIn: true, desktop: true, telegramLinked: true };
const screens: HintScreen[] = ["timetable", "course", "professors", "notifications", "progress", "search"];

describe("first-time hints", () => {
  it("each has an id, its text and its rule, and ids are unique", () => {
    expect(new Set(HINTS.map((h) => h.id)).size).toBe(HINTS.length);
    for (const h of HINTS) {
      expect(h.text.length).toBeGreaterThan(10);
      expect(typeof h.when).toBe("function");
    }
  });

  it("shows at most one hint per screen, and never once dismissed", () => {
    for (const screen of screens) {
      const first = pickHint(screen, { ...student, courseCode: "MATH111", telegramLinked: false }, []);
      if (!first) continue;
      expect(HINTS.filter((h) => h.screen === screen && h.id === first.id)).toHaveLength(1);
      expect(pickHint(screen, { ...student, courseCode: "MATH111", telegramLinked: false }, [first.id])?.id ?? null).not.toBe(first.id);
    }
    expect(pickHint("timetable", student, ["timetable-google"])).toBeNull();
  });

  it("follows each hint's rule", () => {
    expect(pickHint("timetable", student, [])?.action?.(student)).toEqual({ label: "Set up", href: "/me#calendar" });
    expect(pickHint("timetable", { ...student, signedIn: false }, [])).toBeNull();
    expect(pickHint("notifications", student, [])).toBeNull(); // Telegram already linked
    expect(pickHint("notifications", { ...student, telegramLinked: false }, [])?.id).toBe("notifications-telegram");
    expect(pickHint("search", { ...student, desktop: false }, [])).toBeNull(); // ⌘K is a desktop thing
    expect(pickHint("course", { ...student, courseCode: "MATH111" }, [])?.action?.({ ...student, courseCode: "MATH111" })?.href).toContain("start=upload_MATH111");
    expect(pickHint("professors", { signedIn: false, desktop: false }, [])?.action?.({ signedIn: false, desktop: false })).toBeNull();
  });

  it("never stacks with a screen's own banner", () => {
    expect(pickHint("progress", { ...student, busy: true }, [])).toBeNull();
  });

  it("keeps only known ids from what is stored", () => {
    expect(cleanHints({ "timetable-google": "2026-11-04T10:00:00Z", nope: "x", "search-shortcut": 3 })).toEqual({ "timetable-google": "2026-11-04T10:00:00Z" });
    expect(cleanHints(null)).toEqual({});
  });
});

const render = (node: React.ReactElement, dismissed: string[] = [], signedIn = true) => renderToStaticMarkup(createElement(HintsProvider, { signedIn, telegramLinked: true, dismissed }, node));

describe("Timetable: no Google block, no Open in LMS, one calendar hint", () => {
  const page = timetableDemo("sheet");
  const key = page.weeks.flatMap((w) => w.days).flatMap((d) => d.classes).find((c) => c.day === page.day)!.key;

  it("desktop: the lesson panel offers Open course only, and Coming up has no feed settings", () => {
    const html = render(createElement(TimetableScreen, { page, open: key, demo: true }));
    expect(html).toContain("Open course");
    expect(html).not.toContain("Open in LMS");
    expect(html).not.toContain("Add to Google Calendar");
    expect(html).not.toContain("In Google Calendar");
    const coming = render(createElement(TimetableScreen, { page, open: null, demo: true }));
    expect(coming).toContain("Coming up");
    expect(coming).not.toContain("Add to Google Calendar");
    expect(coming).not.toContain('role="switch"');
  });

  it("the lesson panel has no LMS link at all", () => {
    const c = page.weeks.flatMap((w) => w.days).flatMap((d) => d.classes)[0];
    expect(lessonPanel(c)).not.toHaveProperty("lmsHref");
  });

  it("phone: Day by default with the week strip, no Google block", () => {
    const html = render(createElement(PhoneTimetable, { data: page, demo: true }));
    expect(html).toContain('aria-label="Days, swipe for other weeks"');
    expect(html).not.toContain("Add to Google Calendar");
    expect(html).not.toContain("Open in LMS");
    const month = render(createElement(PhoneTimetable, { data: { ...page, view: "month" }, demo: true }));
    expect(month).not.toContain("Add to Google Calendar");
    expect(month).not.toContain("In Google Calendar");
  });

  it("shows the calendar hint, linking to Settings → Calendar, until it is dismissed", () => {
    const shown = render(createElement(TimetableScreen, { page, demo: true }));
    expect(shown).toContain('data-hint="timetable-google"');
    expect(shown).toContain('href="/me#calendar"');
    expect(shown.match(/data-hint=/g)).toHaveLength(1);
    expect(render(createElement(TimetableScreen, { page, demo: true }), ["timetable-google"])).not.toContain("data-hint");
    expect(render(createElement(PhoneTimetable, { data: page, demo: true }), ["timetable-google"])).not.toContain("data-hint");
  });
});

describe("Settings → Calendar holds everything about the Google Calendar feed", () => {
  const data = profileDemo();
  it("desktop: Add to Google Calendar, the layer switches, Reset link and the refresh note in one section", () => {
    const html = render(createElement(SettingsScreen, { data: adapt.profile(data), actions: { resetCalendar: async () => ({ ok: true }) } }));
    const section = html.slice(html.indexOf('id="calendar"'));
    expect(html).toContain('id="calendar"');
    for (const text of ["Add to Google Calendar", "In Google Calendar", "Reset link", "up to about a day", "Classes", "Holidays"]) expect(section).toContain(text);
  });

  it("phone: the same in its Calendar section", () => {
    const html = render(createElement(PhoneSettings, { data }));
    const section = html.slice(html.indexOf('id="calendar"'));
    expect(html).toContain('id="calendar"');
    for (const text of ["Google Calendar", "In Google Calendar", "Reset link", "up to about a day"]) expect(section).toContain(text);
  });
});

/** Every page.tsx under the app, by its URL. */
function pages(dir = join(process.cwd(), "src/app/(app)"), base = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name.startsWith("@")) continue;
      const seg = name.startsWith("(") ? "" : `/${name}`;
      for (const [k, v] of pages(full, base + seg)) out.set(k, v);
    } else if (name === "page.tsx") out.set(base || "/", readFileSync(full, "utf8"));
  }
  return out;
}
const pageFor = (all: Map<string, string>, path: string) => {
  const segs = path.split("?")[0].split("/").filter(Boolean);
  for (const [route, src] of all) {
    const r = route.split("/").filter(Boolean);
    if (r.length === segs.length && r.every((x, i) => x.startsWith("[") || x === segs[i])) return src;
  }
  return null;
};
/** A page that only redirects: no screen of its own. */
const redirectOnly = (src: string) => /\bredirect\(/.test(src) && !/\breturn\b/.test(src);

describe("every sidebar and palette destination opens the same way", () => {
  const all = pages();
  it("links straight to a page that renders (no redirect hop: one round trip, the loading skeleton, the page change)", () => {
    for (const n of [...NAV, ...NAV_VIEWS, { href: "/search" }, { href: "/rate" }, { href: "/me" }]) {
      const src = pageFor(all, n.href);
      expect(src, n.href).not.toBeNull();
      expect(redirectOnly(src!), `${n.href} redirects`).toBe(false);
    }
  });

  it("Curriculum opens its own page and stays active across programmes and schools", () => {
    const cur = NAV.find((n) => n.label === "Curriculum")!;
    expect(cur.href).toBe("/programs/mine/curriculum");
    for (const p of ["/programs/mine/curriculum", "/programs/123/curriculum", "/programs", "/schools/computing"]) expect(navActive(cur, p), p).toBe(true);
    expect(navActive(cur, "/professors")).toBe(false);
    expect(NAV.filter((n) => navActive(n, "/programs/mine/curriculum")).map((n) => n.label)).toEqual(["Curriculum"]);
  });
});
