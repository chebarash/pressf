import Link from "next/link";
import { cx } from "./cx";
import { RatingRing } from "./RatingRing";
import { difficultyBars, hoursBars, type Split } from "./rating-geometry";
import s from "./RatingStrip.module.css";

export type RatingStripProps = {
  /** % recommend and optional yes/unsure/no split for the ring. */
  recommend: { pct: number; split?: Split };
  /** Median hours a week, e.g. 6 → "≈ 6 h/wk". null hides the sticker. */
  hours?: number | null;
  /** Average difficulty 1–5 and its word ("Hard-ish", from difficultyWord). */
  difficulty?: { value: number; word: string } | null;
  /** Tap scrolls to the full summary, e.g. "#ratings". */
  href?: string;
  className?: string;
};

/** Course header rating stickers (Figma App/RatingStrip 4199:7448). */
export function RatingStrip({ recommend, hours, difficulty, href, className }: RatingStripProps) {
  const h = hoursBars(hours ?? null);
  const d = difficultyBars(difficulty?.value ?? null);
  const body = (
    <>
      <span className={cx(s.sticker, s.teal)} style={{ rotate: "1.5deg" }}>
        <RatingRing split={recommend.split ?? recommend.pct} size={24} thickness={0.55} />
        <span>{recommend.pct}% recommend</span>
      </span>
      {hours !== null && hours !== undefined ? (
        <span className={cx(s.sticker, s.mustard)} style={{ rotate: "-1.5deg" }}>
          <span className={s.bars} aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cx(s.bar, i < h && s.onAccent)} style={{ height: 14 }} />
            ))}
          </span>
          <span>≈ {Math.round(hours)} h/wk</span>
        </span>
      ) : null}
      {difficulty ? (
        <span className={cx(s.sticker, s.rust)} style={{ rotate: "1deg" }}>
          <span className={cx(s.bars, s.rising)} aria-hidden>
            {[5, 8, 11, 14, 17].map((height, i) => (
              <span key={i} className={cx(s.bar, i < d && s.onDanger)} style={{ height }} />
            ))}
          </span>
          <span>{difficulty.word}</span>
        </span>
      ) : null}
    </>
  );
  return href ? (
    <Link href={href} className={cx(s.strip, className)}>
      {body}
    </Link>
  ) : (
    <div className={cx(s.strip, className)}>{body}</div>
  );
}
