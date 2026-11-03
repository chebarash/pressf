import { describe, expect, it } from "vitest";
import { DEFAULT_LAYERS, lowerDay, parseLayers, schoolTone, since, termShort, toggleLayerHref, trendDelta } from "@/screens/mobile/mc/format";

describe("mobile screen formatting", () => {
  it("says when cached LMS data is from (5.5)", () => {
    const now = new Date("2026-11-03T10:00:00Z");
    expect(since("2026-11-03T03:40:00Z", now)).toBe("08:40");
    expect(since("2026-11-01T03:40:00Z", now)).toBe("1 Nov");
    expect(since(null, now)).toBe("earlier");
  });

  it("labels the semester trend (7.4)", () => {
    expect(termShort("Fall 2024")).toBe("F24");
    expect(trendDelta([{ term: "Fall 2024", value: 86, count: 9 }, { term: "Fall 2026", value: 91, count: 12 }])).toBe("↑ 5 since F24");
    expect(trendDelta([{ term: "Spring 2025", value: 80, count: 9 }, { term: "Fall 2025", value: 72, count: 9 }])).toBe("↓ 8 since S25");
    expect(trendDelta([{ term: "Fall 2024", value: 86, count: 9 }])).toBeNull();
  });

  it("lower-cases today/tomorrow inside a line", () => {
    expect(lowerDay("Tomorrow 09:00")).toBe("tomorrow 09:00");
    expect(lowerDay("Sunday 23:59")).toBe("Sunday 23:59");
  });

  it("reads and toggles calendar layers, classes off by default (6.1, 6.2)", () => {
    expect(parseLayers(null)).toEqual(DEFAULT_LAYERS);
    expect(DEFAULT_LAYERS).not.toContain("classes");
    expect(parseLayers("holidays,bogus,exams")).toEqual(["exams", "holidays"]);
    expect(parseLayers("")).toEqual([]);
    expect(toggleLayerHref(["exams", "holidays"], "classes")).toBe("/calendar?layers=classes,exams,holidays");
    expect(toggleLayerHref(["exams", "holidays"], "exams")).toBe("/calendar?layers=holidays");
  });

  it("colours schools by name (7.8)", () => {
    expect(schoolTone("School of Computing")).toBe("computing");
    expect(schoolTone("School of Medicine")).toBe("medicine");
    expect(schoolTone("Humanities & Sciences")).toBe("humanities");
    expect(schoolTone("Something else")).toBeNull();
  });
});
