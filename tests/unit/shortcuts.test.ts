import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keyName } from "@/platform/keys";
import { NAV, NAV_PREFIX, NAV_VIEWS } from "@/ui/shell/nav";

/** Every .tsx under a folder, as [path, source]. */
function sources(dir: string): Array<[string, string]> {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return p.endsWith(".tsx") ? [[p, readFileSync(p, "utf8")] as [string, string]] : [];
  });
}

const all = (text: string, re: RegExp) => [...text.matchAll(re)].map((m) => m[1]);

describe("desktop shortcuts: one per action", () => {
  const navKeys = NAV.map((n) => n.key);

  it("goes to each section with F (for Press F) then its own letter", () => {
    expect(NAV_PREFIX).toBe("f");
    expect(new Set(navKeys).size).toBe(navKeys.length);
    for (const k of navKeys) expect(k).toMatch(/^[a-eg-z]$/);
    expect(Object.fromEntries(NAV.map((n) => [n.label, n.key]))).toMatchObject({ Timetable: "t", Courses: "c" });
    const sidebar = readFileSync("src/ui/shell/Sidebar.tsx", "utf8");
    expect(sidebar).toContain("F {n.key.toUpperCase()}");
  });

  it("leaves no G sequences and binds page keys as single keys", () => {
    const pageKeys = sources("src/screens/desktop").flatMap(([file, text]) =>
      [...all(text, /data-key="([^"]+)"/g), ...all(text, /keyName="([^"]+)"/g), ...all(text, /<KeyTo k="([^"]+)"/g)].map((k) => ({ file, key: k.replace(/^g (?=\S)/, "") })),
    );
    expect(pageKeys.length).toBeGreaterThan(5);
    expect(pageKeys.filter((p) => /\s/.test(p.key))).toEqual([]);
    // A page's own F (Press F, course files) is reached as F F; its hint says so.
    const professor = readFileSync("src/screens/desktop/Professor.tsx", "utf8");
    expect(professor).toContain("<Hint>F F</Hint>");
    const hints = sources("src/screens/desktop").flatMap(([, text]) => all(text, /hint="([^"]+)"/g));
    expect(hints.filter((h) => /^G /.test(h))).toEqual([]);
  });

  it("has one search shortcut: ⌘K / Ctrl+K, no bare F or / for search", () => {
    const keyboard = readFileSync("src/screens/desktop/global/Keyboard.tsx", "utf8");
    expect(keyboard).not.toMatch(/key === "f"\)\s*\{\s*e\.preventDefault\(\);\s*openPalette/);
    expect(keyboard).not.toMatch(/key === "g"/);
    const search = readFileSync("src/screens/desktop/split/SearchScreen.tsx", "utf8");
    expect(search).not.toMatch(/data-key="\/"/);
    const palette = readFileSync("src/screens/desktop/global/CommandPalette.tsx", "utf8");
    expect(palette).not.toMatch(/keyName\(e\) === "[np]"/);
  });

  it("has one Timetable (Calendar merged into it): F T the week, F K the month, ← → on both", async () => {
    expect(NAV.map((n) => n.label)).not.toContain("Calendar");
    expect(NAV.find((n) => n.label === "Timetable")).toMatchObject({ key: "t", href: "/timetable" });
    expect(NAV_VIEWS).toEqual([{ label: "Timetable · Month", href: "/timetable?view=month", key: "k" }]);
    const { GO_TO } = await import("@/screens/desktop/global/bus");
    expect(GO_TO.find((g) => g.key === "k")?.href).toBe("/timetable?view=month");
    expect(GO_TO.find((g) => g.key === "t")?.href).toBe("/timetable");
    const goKeys = GO_TO.map((g) => g.key);
    expect(new Set(goKeys).size).toBe(goKeys.length);
    for (const file of ["src/screens/desktop/split/TimetableScreen.tsx", "src/screens/desktop/split/CalendarScreen.tsx"]) {
      const text = readFileSync(file, "utf8");
      expect(text).toContain('data-key="ArrowLeft"');
      expect(text).toContain('data-key="ArrowRight"');
    }
  });

  it("sends /calendar to Timetable's month, keeping the query", async () => {
    const config = (await import("../../next.config")).default;
    const redirects = await config.redirects!();
    expect(redirects).toEqual([{ source: "/calendar", destination: "/timetable?view=month", permanent: false }]);
    expect(existsSync("src/app/(app)/calendar/page.tsx")).toBe(false);
  });

  it("reads keys from the physical key on any layout", () => {
    expect(keyName({ key: "а", code: "KeyF", shiftKey: false })).toBe("f");
    expect(keyName({ key: "с", code: "KeyC", shiftKey: false })).toBe("c");
  });
});

describe("admin shortcuts: one per action", () => {
  const sidebar = readFileSync("src/screens/admin/Sidebar.tsx", "utf8");
  const sections = Object.keys(JSON.parse(`{${sidebar.match(/SECTION_KEYS[^=]*= \{([^}]+)\}/)![1].replace(/(\w+):/g, '"$1":')}}`));

  it("goes to each section with F then a letter, like the app", () => {
    expect(sections.length).toBe(11);
    expect(sections).not.toContain("f");
    expect(sidebar).toContain('k === "f"');
    expect(sidebar).not.toMatch(/k === "g"/);
  });

  it("no admin page uses a bare F for itself", () => {
    const pageKeys = sources("src/screens/admin").flatMap(([file, text]) =>
      all(text, /useKeys\(\s*\{([\s\S]*?)\}\s*(?:,|\))/g).flatMap((body) => all(body, /(?:^|[\s,{])"?([a-z])"?\s*:/g).map((key) => ({ file, key }))),
    );
    expect(pageKeys.length).toBeGreaterThan(5);
    expect(pageKeys.filter((p) => p.key === "f")).toEqual([]);
  });
});
