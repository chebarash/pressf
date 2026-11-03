import { cx } from "./cx";
import type { ScoreTier } from "./score-tier";
import s from "./Score.module.css";

export type ScoreProps = {
  /** Text in the tile, e.g. "84%" or "4.0". */
  value: string;
  /** Figma Tier. Use pctTier()/fiveTier() from ./score-tier to pick it. */
  tier: ScoreTier;
  /** Figma Size: S 52 · M 72 · L 144. */
  size?: "s" | "m" | "l";
  /** Accessible description, e.g. "84% recommend". Defaults to the value. */
  label?: string;
  className?: string;
};

const TYPE = { s: "t-display-xs", m: "t-display-sm", l: "t-display-lg" } as const;

/** Score tile (Figma Score 4008:1068). */
export function Score({ value, tier, size = "s", label, className }: ScoreProps) {
  return (
    <span className={cx(s.score, s[size], s[tier], TYPE[size], className)} role="img" aria-label={label ?? value}>
      {value}
    </span>
  );
}
