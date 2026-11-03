import { deepLink } from "@/lib/telegram/links";
import { startParam, startPath } from "@/lib/telegram/start";
import { describe, expect, it } from "vitest";
import { normalizeCode } from "@/lib/catalog";
import { isAdminEmail } from "@/lib/env";
import { esc } from "@/lib/telegram/html";

describe("normalizeCode", () => {
  it("matches the bot's form", () => {
    expect(normalizeCode("MATH 211")).toBe("MATH211");
    expect(normalizeCode("math-211")).toBe("MATH211");
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
});

describe("startPath", () => {
  it("opens courses and professors", () => {
    expect(startPath("course_MATH111")).toBe("/courses/MATH111");
    expect(startPath("professor_g-pinto")).toBe("/professors/g-pinto");
    expect(startPath("files_MATH111")).toBe("/courses/MATH111#files");
  });
  it("ignores anything else", () => {
    expect(startPath("evil_../admin")).toBeNull();
    expect(startPath(undefined)).toBeNull();
  });
});

describe("deep links", () => {
  const id = "2a771f96-9095-42c6-9a18-fde64b6f6c52";
  it("makes a page into a start value and back", () => {
    for (const path of ["/courses/MATH111", "/courses/MATH111#files", "/professors/g-pinto"]) expect(startPath(startParam(path))).toBe(path);
    expect(startPath(startParam(`/files/${id}`))).toBe(`/files?open=${id}`);
  });
  it("goes straight to the app when the bot has a Main Mini App", () => {
    expect(deepLink("/courses/MATH111", true)).toBe("https://t.me/pressfapp?startapp=course_MATH111");
  });
  it("goes through the bot when it does not", () => {
    expect(deepLink("/courses/MATH111", false)).toBe("https://t.me/pressfapp?start=course_MATH111");
  });
  it("opens the bare app for anything it cannot carry", () => {
    expect(deepLink("/professors/gon%C3%A7alo", true)).toBe("https://t.me/pressfapp?startapp");
    expect(deepLink("", false)).toBe("https://t.me/pressfapp");
  });
});
