import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { darkColor, lightColor, tokensCss } from "@/ui/build-tokens";

describe("design tokens", () => {
  it("tokens.css matches data/design-tokens.json (run npm run tokens)", () => {
    expect(readFileSync("src/ui/tokens.css", "utf8")).toBe(tokensCss());
  });
  it("has light and dark values for every colour", () => {
    expect(lightColor("bg/page")).toBe("#f5f0d6");
    expect(darkColor("bg/page")).toBe("#0e0e0d");
    const css = tokensCss();
    expect(css).toContain('--bg-accent: #2a7181;');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain(".t-mobile-title {");
  });
});
