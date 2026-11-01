import { startPath } from "@/components/TelegramApp";
import { groupByCourse, shortTitle } from "@/lib/files";
import { pageList } from "@/components/Pager";
import { standardName } from "@/lib/telegram/store";
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

describe("standardName", () => {
  const file = { fileName: "scan_final (2).pdf", courseCode: "MATH111", courseName: "Calculus 1", type: "final", term: "Fall 2024", hasSolutions: false, author: null };
  it("orders course, kind and term", () => expect(standardName(file)).toBe("Calculus 1 Final Fall 2024.pdf"));
  it("adds solutions and the author last", () => expect(standardName({ ...file, type: "mock", hasSolutions: true, author: "Meros" })).toBe("Calculus 1 Mock Fall 2024 Solutions by Meros.pdf"));
  it("leaves out what is unknown", () => expect(standardName({ ...file, term: null })).toBe("Calculus 1 Final.pdf"));
  it("keeps a book's title and the extension", () => expect(standardName({ ...file, type: "textbook", fileName: "Calculus_9th.docx" })).toBe("Calculus 1 Textbook Calculus 9th.docx"));
});

describe("pageList", () => {
  it("shows all of a short list", () => expect(pageList(2, 4)).toEqual([1, 2, 3, 4]));
  it("keeps both ends and the neighbours", () => expect(pageList(8, 20)).toEqual([1, "gap", 7, 8, 9, "gap", 20]));
  it("fills a gap of one page instead of hiding it", () => expect(pageList(3, 20)).toEqual([1, 2, 3, 4, "gap", 20]));
  it("works at the last page", () => expect(pageList(20, 20)).toEqual([1, "gap", 19, 20]));
});

describe("groupByCourse", () => {
  const file = (courseCode: string | null, term: string | null = null, courseName: string | null = courseCode) => ({ courseCode, courseName, term });
  it("puts newest files first", () => {
    const [group] = groupByCourse([file("A", "Spring 2024"), file("A", "Fall 2025"), file("A", "Spring 2025")]);
    expect(group.files.map((f) => f.term)).toEqual(["Fall 2025", "Spring 2025", "Spring 2024"]);
  });
  it("orders my courses, then the fullest, then files with no course", () => {
    const groups = groupByCourse([file(null), file("B"), file("C"), file("C"), file("A")], new Set(["A"]));
    expect(groups.map((g) => g.code)).toEqual(["A", "C", "B", null]);
  });
});

describe("shortTitle", () => {
  it("drops the course the group already shows", () => expect(shortTitle("Calculus 1 Final Fall 2024", "Calculus 1")).toBe("Final Fall 2024"));
  it("does not cut a longer course name", () => expect(shortTitle("Calculus 10 Final", "Calculus 1")).toBe("Calculus 10 Final"));
  it("keeps other titles", () => expect(shortTitle("Random notes", "Calculus 1")).toBe("Random notes"));
});

describe("startPath", () => {
  it("opens courses and professors", () => {
    expect(startPath("course_MATH111")).toBe("/courses/MATH111");
    expect(startPath("professor_g-pinto")).toBe("/professors/g-pinto");
  });
  it("ignores anything else", () => {
    expect(startPath("evil_../admin")).toBeNull();
    expect(startPath(undefined)).toBeNull();
  });
});

