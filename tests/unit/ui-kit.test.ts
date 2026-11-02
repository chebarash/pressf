import { describe, expect, it } from "vitest";
import { fiveTier, pctTier } from "@/ui/components/score-tier";
import { CHART, difficultyBars, hoursBars, ringArcs, trendPoints } from "@/ui/components/rating-geometry";
import { FILE_FLAG } from "@/ui/components/file-flag";

describe("score tiers", () => {
  it("maps percentages to High / Mid / Low", () => {
    expect(pctTier(84)).toBe("high");
    expect(pctTier(75)).toBe("high");
    expect(pctTier(74.9)).toBe("mid");
    expect(pctTier(50)).toBe("mid");
    expect(pctTier(49)).toBe("low");
    expect(pctTier(0)).toBe("low");
  });
  it("is None without a value or under the minimum number of ratings", () => {
    expect(pctTier(null)).toBe("none");
    expect(pctTier(undefined)).toBe("none");
    expect(pctTier(Number.NaN)).toBe("none");
    expect(pctTier(90, 4)).toBe("none");
    expect(pctTier(90, 5)).toBe("high");
  });
  it("maps 1–5 scores", () => {
    expect(fiveTier(4)).toBe("high");
    expect(fiveTier(3.5)).toBe("mid");
    expect(fiveTier(2.9)).toBe("low");
    expect(fiveTier(0)).toBe("none");
    expect(fiveTier(null)).toBe("none");
  });
});

describe("rating ring", () => {
  it("lays arcs clockwise: yes, unsure, no", () => {
    const arcs = ringArcs({ yes: 84, unsure: 9, no: 7 });
    expect(arcs.map((a) => [a.key, a.start, a.pct])).toEqual([
      ["yes", 0, 84],
      ["unsure", 84, 9],
      ["no", 93, 7],
    ]);
  });
  it("puts the rest into no for a bare percentage and normalises totals", () => {
    expect(ringArcs(70).map((a) => a.pct)).toEqual([70, 0, 30]);
    const arcs = ringArcs({ yes: 1, unsure: 1, no: 2 });
    expect(arcs.map((a) => a.pct)).toEqual([25, 25, 50]);
  });
});

describe("trend chart", () => {
  it("matches the Figma course chart (71 → 84 %)", () => {
    const pts = trendPoints([71, 76, 81, 79, 84]);
    expect(pts[0].x).toBe(CHART.inset);
    expect(pts[4].x).toBe(CHART.width - CHART.inset);
    expect(pts[4].y).toBeCloseTo(13.3, 1);
    expect(pts[0].y).toBeCloseTo(37.3, 1);
  });
  it("keeps small changes small and flat lines flat", () => {
    const small = trendPoints([86, 91]);
    expect(small[0].y - small[1].y).toBeCloseTo(14, 5);
    expect(trendPoints([80, 80]).every((p) => p.y === CHART.top)).toBe(true);
    expect(trendPoints([])).toEqual([]);
  });
});

describe("bar glyphs", () => {
  it("fills hours and difficulty bars", () => {
    expect([1, 3, 5, 6, 8, 12].map(hoursBars)).toEqual([1, 1, 2, 2, 3, 4]);
    expect(hoursBars(null)).toBe(0);
    expect([1, 2.4, 3.2, 4.6, 5].map(difficultyBars)).toEqual([1, 2, 3, 5, 5]);
    expect(difficultyBars(null)).toBe(0);
  });
});

describe("file flags", () => {
  it("covers every file type with a Figma flag colour", () => {
    expect(FILE_FLAG.exam).toBe("exam");
    expect(FILE_FLAG.lecture).toBe("lecture");
    expect(FILE_FLAG.practice).toBe("notes");
    expect(Object.keys(FILE_FLAG)).toHaveLength(10);
  });
});
