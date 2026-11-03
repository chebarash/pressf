import Link from "next/link";
import type { ReactNode } from "react";
import { ClockIcon } from "../icons";
import { cx } from "./cx";
import { Face } from "./Face";
import { RatingRing } from "./RatingRing";
import type { Split } from "./rating-geometry";
import { Tag } from "./Tag";
import { pctTier, type ScoreTier } from "./score-tier";
import s from "./CourseCard.module.css";

/** Sticker tint by tier (Figma CourseCard): teal high, mustard mid, rust low. */
const STICKER: Record<ScoreTier, "high" | "mid" | "low"> = { high: "high", mid: "mid", low: "low", none: "high" };

export type CourseCardProps = {
  /** Course code shown in the tag, e.g. MATH111. */
  code: string;
  name: string;
  teacher?: { name: string; face?: string | null };
  /** Next class (my courses) or "≈ 6 h · Hard-ish" (catalog). */
  line?: string;
  /** Icon before the line; clock by default. */
  lineIcon?: ReactNode;
  /** % recommend sticker; omit under 5 ratings (Figma showRating). */
  recommend?: { pct: number; split?: Split };
  href?: string;
  className?: string;
};

/** Course card (Figma App/CourseCard 4203:7775). */
export function CourseCard({ code, name, teacher, line, lineIcon, recommend, href, className }: CourseCardProps) {
  const body = (
    <>
      <span className={s.top}>
        <Tag tone="accent">{code}</Tag>
        {recommend ? (
          <span className={cx(s.sticker, s[STICKER[pctTier(recommend.pct)]])} aria-label={`${recommend.pct}% recommend`}>
            <RatingRing split={recommend.split ?? recommend.pct} size={20} />
            <span>{recommend.pct}%</span>
          </span>
        ) : null}
      </span>
      <span className={cx(s.name)}>{name}</span>
      {teacher ? (
        <span className={s.teacher}>
          <Face src={teacher.face} size={28} />
          <span>{teacher.name}</span>
        </span>
      ) : null}
      {line ? (
        <span className={s.line}>
          <span className={s.lineIcon}>{lineIcon ?? <ClockIcon size={16} />}</span>
          <span>{line}</span>
        </span>
      ) : null}
    </>
  );
  return href ? (
    <Link href={href} className={cx(s.cardBox, className)}>
      {body}
    </Link>
  ) : (
    <div className={cx(s.cardBox, className)}>{body}</div>
  );
}
