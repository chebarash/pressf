import { describe, expect, it } from "vitest";
import { isStale, normalizeCode, type Catalog } from "@/lib/catalog";
import { isAdminEmail } from "@/lib/env";
import { tierOf } from "@/lib/ratings";
import { esc, reviewCaption } from "@/lib/telegram/bot";

describe("tierOf", () => {
  it("draws the tier borders", () => {
    expect(tierOf(null)).toBe("None");
    expect(tierOf(4)).toBe("High");
    expect(tierOf(3.7)).toBe("High");
    expect(tierOf(3)).toBe("Mid");
    expect(tierOf(2.9)).toBe("Low");
  });
});

describe("normalizeCode", () => {
  it("matches the bot's form", () => {
    expect(normalizeCode("MATH 211")).toBe("MATH211");
    expect(normalizeCode("math-211")).toBe("MATH211");
  });
});

describe("isStale", () => {
  const with_ = (updatedAt: Date | null) => ({ updatedAt }) as Catalog;
  it("alarms after two days only", () => {
    expect(isStale(with_(null))).toBe(false);
    expect(isStale(with_(new Date()))).toBe(false);
    expect(isStale(with_(new Date(Date.now() - 3 * 86400_000)))).toBe(true);
  });
});

describe("isAdminEmail", () => {
  it("ignores case and spaces", () => {
    expect(isAdminEmail("BOSS@newuu.uz")).toBe(true);
    expect(isAdminEmail("second@newuu.uz")).toBe(true);
    expect(isAdminEmail("student@newuu.uz")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});

describe("telegram text", () => {
  it("escapes HTML from file names", () => expect(esc("a<b>&c")).toBe("a&lt;b&gt;&amp;c"));
  it("fits a Telegram caption", () => {
    const caption = reviewCaption({ fileName: "<x>.pdf", courseCode: null, courseName: null, type: null, term: null, hasSolutions: false, author: null, caption: "y".repeat(5000) });
    expect(caption.length).toBeLessThanOrEqual(1024);
    expect(caption).toContain("&lt;x&gt;");
    expect(caption).toContain("Course: ?");
  });
});
