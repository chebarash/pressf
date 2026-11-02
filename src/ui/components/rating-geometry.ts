/** Pure geometry for the rating visuals (ring, trend chart, bar glyphs). Tested in tests/unit/ui-kit.test.ts. */

export type Split = { yes: number; unsure?: number; no?: number };

/**
 * Ring arcs in percent of the circle, clockwise from 12 o'clock: yes (teal),
 * unsure (mustard), no (rust). A bare % recommend puts the rest into "no".
 */
export function ringArcs(split: Split | number) {
  const raw = typeof split === "number" ? { yes: split, unsure: 0, no: 100 - split } : { yes: split.yes, unsure: split.unsure ?? 0, no: split.no ?? Math.max(0, 100 - split.yes - (split.unsure ?? 0)) };
  const clamp = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);
  const yes = clamp(raw.yes), unsure = clamp(raw.unsure), no = clamp(raw.no);
  const total = yes + unsure + no || 1;
  const k = 100 / total;
  const arcs = [
    { key: "yes" as const, pct: yes * k },
    { key: "unsure" as const, pct: unsure * k },
    { key: "no" as const, pct: no * k },
  ];
  let start = 0;
  return arcs.map((a) => {
    const out = { ...a, start };
    start += a.pct;
    return out;
  });
}

/** Chart frame from Figma App/RatingSummary: 322 × 72, baseline at 54, points inset 14 px. */
export const CHART = { width: 322, height: 72, baseline: 54, inset: 14, top: 13.3, maxSpan: 24, maxPxPerPoint: 2.8 } as const;

/**
 * Positions for the "by semester" trend line. The highest value sits at the
 * top line; the spread grows with the range (≈ 1.8 px per point in Figma) but
 * never exceeds 24 px so small changes don't look dramatic.
 */
export function trendPoints(values: number[], width: number = CHART.width) {
  if (!values.length) return [];
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min;
  const k = range ? Math.min(CHART.maxPxPerPoint, CHART.maxSpan / range) : 0;
  const span = width - CHART.inset * 2;
  const step = values.length > 1 ? span / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: values.length > 1 ? CHART.inset + i * step : width / 2,
    y: CHART.top + (max - v) * k,
  }));
}

/** Filled bars for the hours glyph (4 bars): ≤ 3 h → 1, ≈ 5–6 h → 2 (Figma), 8 h → 3, 10+ h → 4. */
export function hoursBars(hours: number | null) {
  if (hours === null || !Number.isFinite(hours)) return 0;
  return hours < 4 ? 1 : hours < 7 ? 2 : hours < 10 ? 3 : 4;
}

/** Filled bars for the difficulty glyph (5 ascending bars) from a 1–5 average. */
export function difficultyBars(difficulty: number | null) {
  if (difficulty === null || !Number.isFinite(difficulty)) return 0;
  return Math.max(1, Math.min(5, Math.round(difficulty)));
}
