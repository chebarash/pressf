import { MIN_RATINGS } from "@/core/ratings";

/** Figma Score tiers (4008:1068): teal High, mustard Mid, brown Low, sunken None. */
export type ScoreTier = "high" | "mid" | "low" | "none";

/** Share (0–100) at or above which a score is High / Mid. */
export const PCT_HIGH = 75;
export const PCT_MID = 50;

/**
 * Tier for a percentage score (% recommend, % pressed F). `null`, NaN or fewer
 * than MIN_RATINGS answers → "none" (we never colour a score that one student
 * could swing).
 */
export function pctTier(pct: number | null | undefined, count = MIN_RATINGS): ScoreTier {
  if (pct === null || pct === undefined || Number.isNaN(pct) || count < MIN_RATINGS) return "none";
  if (pct >= PCT_HIGH) return "high";
  if (pct >= PCT_MID) return "mid";
  return "low";
}

/** Tier for a 1–5 score (legacy 4.0-style numbers): ≥ 4 High, ≥ 3 Mid. */
export function fiveTier(value: number | null | undefined): ScoreTier {
  if (value === null || value === undefined || Number.isNaN(value) || value <= 0) return "none";
  if (value >= 4) return "high";
  if (value >= 3) return "mid";
  return "low";
}

/** CSS colour token for a tier, for text or fills outside the Score tile. */
export const TIER_COLOR: Record<ScoreTier, string> = {
  high: "var(--rating-high)",
  mid: "var(--rating-mid)",
  low: "var(--rating-low)",
  none: "var(--bg-sunken)",
};
