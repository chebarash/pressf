import Link from "next/link";
import { ChevronRightIcon } from "../icons";
import { cx } from "./cx";
import s from "./FeedMark.module.css";

export type FeedMarkGrade = { what: string | null; score: number; max: number | null; tier: "high" | "mid" | "low" };
export type FeedMarkAttendance = {
  kind: "mark" | "limit";
  lesson: string | null;
  when: string | null;
  mark: "absent" | "late" | "excused" | null;
  line: string | null;
  tone: "ok" | "warn" | "danger";
  missed?: number | null;
  limit?: number | null;
};

export type FeedMarkProps = {
  grade?: FeedMarkGrade | null;
  attendance?: FeedMarkAttendance | null;
  /** The course's progress page ("See progress"). */
  href?: string | null;
  /** Off inside a row that is itself a button or a link (no nested links). */
  links?: boolean;
  /** "row" under a feed item's title; "pane" in the reading pane or sheet (bigger score). */
  size?: "row" | "pane";
  className?: string;
};

const MARK = { absent: "Absent", late: "Late", excused: "Excused" } as const;
const TIER_WORD = { high: "high", mid: "middle", low: "low" } as const;

/**
 * The grade or attendance under a feed item (App/FeedItem, grade and absence
 * types), drawn like the new-files list: the score in its tier colour with
 * what was graded, or the class with its mark in the attendance colours and
 * the absences left in a tone, then "See progress".
 */
export function FeedMark({ grade, attendance, href, links = true, size = "row", className }: FeedMarkProps) {
  if (!grade && !attendance) return null;
  const progress = href ? (
    links ? (
      <Link prefetch href={href} className={cx(s.progress, s.link)}>
        See progress
        <ChevronRightIcon size={14} />
      </Link>
    ) : null
  ) : null;

  if (grade) {
    const outOf = grade.max ? `out of ${grade.max}` : null;
    return (
      <div className={cx(s.mark, s[size], className)}>
        <span className={cx(s.score, s[grade.tier])} role="img" aria-label={`${grade.score}${grade.max ? ` out of ${grade.max}` : ""}, ${TIER_WORD[grade.tier]}`}>
          {grade.score}
        </span>
        <span className={s.text}>
          <span className={s.what}>{grade.what ?? "Grade"}</span>
          {outOf ? <span className={s.sub}>{outOf}</span> : null}
        </span>
        {progress}
      </div>
    );
  }

  const a = attendance!;
  const cls = [a.lesson, a.when].filter(Boolean).join(" · ");
  const used = a.kind === "limit" && a.missed != null && a.limit ? `${a.missed} of ${a.limit} used` : null;
  return (
    <div className={cx(s.mark, s.att, s[size], className)}>
      <span className={s.top}>
        {a.mark ? <span className={cx(s.pill, s[a.mark])}>{MARK[a.mark]}</span> : null}
        {cls || used ? <span className={s.cls}>{cls || used}</span> : null}
      </span>
      {a.line || progress ? (
        <span className={s.bottom}>
          {a.line ? (
            <span className={cx(s.left, s[a.tone])}>
              <span className={s.dot} aria-hidden />
              {a.line}
            </span>
          ) : (
            <span />
          )}
          {progress}
        </span>
      ) : null}
    </div>
  );
}
