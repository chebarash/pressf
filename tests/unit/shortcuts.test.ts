import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keyName } from "@/platform/keys";
import { NAV } from "@/ui/shell/nav";

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

  it("gives every section its own single letter", () => {
    expect(new Set(navKeys).size).toBe(navKeys.length);
    for (const k of navKeys) expect(k).toMatch(/^[a-z]$/);
    // Taken by the keyboard layer itself: list movement.
    expect(navKeys).not.toContain("j");
    expect(navKeys).not.toContain("k");
  });

  it("never reuses a section letter for a page key", () => {
    const pageKeys = sources("src/screens/desktop").flatMap(([file, text]) =>
      [...all(text, /data-key="([^"]+)"/g), ...all(text, /keyName="([^"]+)"/g), ...all(text, /<KeyTo k="([^"]+)"/g)].map((k) => ({ file, key: k.replace(/^g (?=\S)/, "") })),
    );
    expect(pageKeys.length).toBeGreaterThan(5);
    const clashes = pageKeys.filter((p) => navKeys.includes(p.key));
    expect(clashes).toEqual([]);
    // No two-key sequences are left anywhere in the markup.
    expect(pageKeys.filter((p) => /\s/.test(p.key))).toEqual([]);
  });

  it("has one search shortcut: ⌘K / Ctrl+K, no plain F or / for search", () => {
    const keyboard = readFileSync("src/screens/desktop/global/Keyboard.tsx", "utf8");
    expect(keyboard).not.toMatch(/key === "f"/);
    expect(keyboard).not.toMatch(/chord/i);
    const search = readFileSync("src/screens/desktop/split/SearchScreen.tsx", "utf8");
    expect(search).not.toMatch(/data-key="\/"/);
  });

  it("reads keys from the physical key on any layout", () => {
    expect(keyName({ key: "с", code: "KeyC", shiftKey: false })).toBe("c");
    expect(keyName({ key: "п", code: "KeyG", shiftKey: false })).toBe("g");
  });
});

describe("admin shortcuts: one per action", () => {
  const sidebar = readFileSync("src/screens/admin/Sidebar.tsx", "utf8");
  const sections = Object.keys(JSON.parse(`{${sidebar.match(/SECTION_KEYS[^=]*= \{([^}]+)\}/)![1].replace(/(\w+):/g, '"$1":')}}`));

  it("gives every section a single letter without a G prefix", () => {
    expect(sections.length).toBe(9);
    expect(sidebar).not.toMatch(/k === "g"|`G \$\{/);
  });

  it("never reuses a section letter for a page key", () => {
    const pageKeys = sources("src/screens/admin").flatMap(([file, text]) =>
      all(text, /useKeys\(\s*\{([\s\S]*?)\}\s*(?:,|\))/g).flatMap((body) => all(body, /(?:^|[\s,{])"?([a-z])"?\s*:/g).map((key) => ({ file, key }))),
    );
    expect(pageKeys.length).toBeGreaterThan(5);
    expect(pageKeys.filter((p) => sections.includes(p.key))).toEqual([]);
  });
});
