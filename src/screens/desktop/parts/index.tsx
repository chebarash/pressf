import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, Ring, SourceIcon, type IconName } from "./Icon";
import s from "./parts.module.css";

export { Icon, Ring, s as css };
export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/* ---------- Keys ---------- */

/** Quiet key hint ("G T", "⌘K"). */
export const Hint = ({ children, className }: { children: ReactNode; className?: string }) => (
  <kbd className={cx(s.hint, className)}>{children}</kbd>
);

/** A real keycap; several keys in a row for chords ("G", "K"). */
export const Keys = ({ keys, className }: { keys: string[]; className?: string }) => (
  <span className={cx(s.keys, className)}>
    {keys.map((k) => (
      <kbd key={k} className={s.key}>
        {k}
      </kbd>
    ))}
  </span>
);

/* ---------- Buttons ---------- */

type ButtonLook = { variant?: "primary" | "secondary"; size?: "m" | "s"; wide?: boolean };
const btnClass = ({ variant = "primary", size = "m", wide }: ButtonLook, extra?: string) =>
  cx(s.btn, variant === "primary" && s.primary, size === "s" && s.small, wide && s.wide, extra);

export const Button = ({ variant, size, wide, className, ...rest }: ButtonLook & ComponentProps<"button">) => (
  <button type="button" className={btnClass({ variant, size, wide }, className)} {...rest} />
);

export const ButtonLink = ({ variant, size, wide, className, ...rest }: ButtonLook & ComponentProps<typeof Link>) => (
  <Link className={btnClass({ variant, size, wide }, className)} {...rest} />
);

/* ---------- Tags and stickers ---------- */

export const Tag = ({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "neutral" | "dark" }) => (
  <span className={cx(s.tag, tone === "neutral" && s.tagNeutral, tone === "dark" && s.tagDark)}>{children}</span>
);

/** Tint for a recommend / pressed-F share: teal from 80, mustard from 60, rust below. */
export const toneOf = (pct: number | null | undefined) => (pct == null ? s.toneSurface : pct >= 80 ? s.toneHigh : pct >= 60 ? s.toneMid : s.toneLow);

export const Pct = ({ value, suffix = "" }: { value: number | null; suffix?: string }) =>
  value == null ? null : <span className={cx(s.pct, toneOf(value))}>{`${value}%${suffix}`}</span>;

/** Rotated sticker with the recommend ring ("84%"), on course cards. */
export const RatingSticker = ({ pct }: { pct: number | null }) =>
  pct == null ? null : (
    <span className={cx(s.miniSticker, toneOf(pct))}>
      <Ring pct={pct} />
      {pct}%
    </span>
  );

const Bars = ({ on, kind }: { on: number; kind: "hours" | "hard" }) => (
  <span className={s.bars} aria-hidden>
    {(kind === "hours" ? [14, 14, 14, 14] : [5, 8, 11, 14, 17]).map((h, i) => (
      <span key={i} className={cx(s.bar, i < on && (kind === "hours" ? s.barOnHours : s.barOnHard))} style={{ height: h }} />
    ))}
  </span>
);

export type Strip = { recommendPct: number | null; hours: number | null; difficulty: number | null; difficultyWord: string | null };

/** The three rating facts at a glance (App/RatingStrip). Hidden under 5 ratings. */
export function RatingStrip({ strip, className }: { strip: Strip; className?: string }) {
  if (strip.recommendPct == null) return null;
  const hoursOn = strip.hours == null ? 0 : strip.hours <= 2 ? 1 : strip.hours <= 5 ? 2 : strip.hours <= 9 ? 3 : 4;
  return (
    <div className={cx(s.stickers, className)}>
      <span className={cx(s.sticker, s.toneHigh)} style={{ transform: "rotate(1.5deg)" }}>
        <Ring pct={strip.recommendPct} size={24} />
        {strip.recommendPct}% recommend
      </span>
      {strip.hours != null && (
        <span className={cx(s.sticker, s.toneMid)} style={{ transform: "rotate(-1.5deg)" }}>
          <Bars on={hoursOn} kind="hours" />≈ {Math.round(strip.hours)} h/wk
        </span>
      )}
      {strip.difficulty != null && (
        <span className={cx(s.sticker, s.toneLow)} style={{ transform: "rotate(1deg)" }}>
          <Bars on={Math.round(strip.difficulty)} kind="hard" />
          {strip.difficultyWord}
        </span>
      )}
    </div>
  );
}

const TAG_TONES = [s.toneHigh, s.toneMid, s.tonePlum, s.toneMoss, s.toneLow];
/** Tag shares ("Exam follows lectures 71%"). */
export const TagStickers = ({ tags }: { tags: Array<{ tag: string; pct: number }> }) => (
  <div className={s.chips}>
    {tags.map((t, i) => (
      <span key={t.tag} className={cx(s.tagSticker, TAG_TONES[i % TAG_TONES.length])}>
        <span>{t.tag}</span>
        <span>{t.pct}%</span>
      </span>
    ))}
  </div>
);

/* ---------- Cards ---------- */

export function CardHead({ title, link, href, hint }: { title: ReactNode; link?: string; href?: string; hint?: string }) {
  return (
    <div className={s.cardHead}>
      <h2 className={s.cardTitle}>{title}</h2>
      {link && href ? (
        <Link href={href} className={s.cardLink}>
          {link}
        </Link>
      ) : link ? (
        <span className={s.cardLink}>{link}</span>
      ) : null}
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

/* ---------- Faces ---------- */

/** Drawn faces only, never photos. Falls back to the mascot. */
export function Face({ src, size, alt = "" }: { src?: string | null; size: number; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- drawn SVG/PNG faces from our own route, sized by the caller
  return <img className={s.face} src={src || "/mascot.png"} width={size} height={size} alt={alt} loading="lazy" decoding="async" />;
}

export function Score({ value, tier }: { value: number | string; tier?: "High" | "Mid" | "Low" | "None" }) {
  return <span className={cx(s.score, tier === "High" && s.scoreHigh, tier === "Low" && s.scoreLow)}>{value}</span>;
}

/* ---------- Files ---------- */

export type FileRowData = {
  id: string;
  title: string;
  /** core/files FileType: decides the flag colour. */
  type: string;
  date: string;
  source: "lms" | "students" | "channel";
  href: string;
  course?: string;
};

const FLAG: Record<string, string> = {
  lecture: "var(--bg-accent)",
  practice: "var(--school-humanities)",
  lab: "var(--school-humanities)",
  exam: "var(--rating-mid)",
  mock: "var(--rating-mid)",
  assignment: "var(--bg-danger)",
  notes: "var(--school-medicine)",
  syllabus: "var(--text-secondary)",
  book: "var(--text-secondary)",
};
const SOURCE_LABEL = { lms: "LMS", students: "From students", channel: "Channel" } as const;

export function FileRow({ file, hideCourse, onClick, className }: { file: FileRowData; hideCourse?: boolean; onClick?: () => void; className?: string }) {
  return (
    <Link href={file.href} className={cx(s.file, className)} onClick={onClick} data-nav-item>
      <span className={s.flag} style={{ background: FLAG[file.type] ?? "var(--border-strong)" }} />
      <span className={s.fileBody}>
        <span className={s.fileTitle}>{file.title}</span>
        <span className={s.fileMeta}>
          {!hideCourse && file.course && <span>{file.course}</span>}
          <span>{file.date}</span>
          <span className={cx(s.fileSource, file.source === "students" && s.fromStudents)}>
            <SourceIcon source={file.source} />
            {SOURCE_LABEL[file.source]}
          </span>
        </span>
      </span>
      <Icon name="chevron-right" size={20} />
    </Link>
  );
}

/* ---------- Notifications ---------- */

export type FeedKind = "announcement" | "grade" | "absence" | "file" | "deadline" | "anonymous" | "upload" | "system";
const FEED_LOOK: Record<FeedKind, { icon: IconName; bg: string }> = {
  announcement: { icon: "mail", bg: "var(--tint-teal)" },
  system: { icon: "mail", bg: "var(--tint-teal)" },
  grade: { icon: "check", bg: "var(--tint-moss)" },
  upload: { icon: "check", bg: "var(--tint-moss)" },
  absence: { icon: "users", bg: "var(--tint-rust)" },
  anonymous: { icon: "send", bg: "var(--tint-plum)" },
  file: { icon: "file", bg: "var(--tint-plum)" },
  deadline: { icon: "clock", bg: "var(--tint-mustard)" },
};

export function FeedBadge({ kind }: { kind: FeedKind }) {
  const look = FEED_LOOK[kind] ?? FEED_LOOK.system;
  return (
    <span className={s.badge} style={{ background: look.bg }}>
      <Icon name={look.icon} size={20} />
    </span>
  );
}

export function FeedRow({ kind, title, meta, unread, selected, ...rest }: { kind: FeedKind; title: string; meta: string; unread: boolean; selected?: boolean } & Omit<ComponentProps<"button">, "title">) {
  return (
    <button type="button" className={cx(s.feed, selected && s.feedSelected)} data-nav-item aria-current={selected || undefined} {...rest}>
      <FeedBadge kind={kind} />
      <span className={s.feedText}>
        <span className={s.feedTitle}>{title}</span>
        <span className={s.feedMeta}>{meta}</span>
      </span>
      {unread && <span className={s.unread} aria-label="Unread" />}
    </button>
  );
}

export const FeedLink = ({ kind, title, meta, unread, href }: { kind: FeedKind; title: string; meta: string; unread: boolean; href: string }) => (
  <Link href={href} className={s.feed} data-nav-item>
    <FeedBadge kind={kind} />
    <span className={s.feedText}>
      <span className={s.feedTitle}>{title}</span>
      <span className={s.feedMeta}>{meta}</span>
    </span>
    {unread && <span className={s.unread} aria-label="Unread" />}
  </Link>
);

/* ---------- Course card ---------- */

export type CourseCardData = { code: string; name: string; href: string; recommendPct: number | null; teacher: { name: string; face: string | null } | null; line: string };

/** App/CourseCard: code, rating sticker, name, teacher, next class (or hours · difficulty). */
export const CourseCard = ({ c }: { c: CourseCardData }) => (
  <Link href={c.href} className={s.courseCard} data-nav-item>
    <span className={s.cardTop}>
      <Tag>{c.code}</Tag>
      <span className={s.cardSpacer} />
      <RatingSticker pct={c.recommendPct} />
    </span>
    <span className={s.cardName}>{c.name}</span>
    {c.teacher && (
      <span className={s.teacher}>
        <Face src={c.teacher.face} size={28} />
        {c.teacher.name}
      </span>
    )}
    <span className={s.cardLine}>
      <Icon name="clock" size={16} />
      {c.line}
    </span>
  </Link>
);

/* ---------- Trend ---------- */

/** Share by semester: soft area, accent line, last point emphasised. Values are percentages. */
export function Trend({ points, height = 72 }: { points: Array<{ term: string; value: number }>; height?: number }) {
  if (points.length < 2) return null;
  const W = 322;
  const top = 12;
  const base = height - 18;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values) - 6;
  const hi = Math.max(...values) + 2;
  const x = (i: number) => 14 + (i * (W - 28)) / (points.length - 1);
  const y = (v: number) => base - ((v - lo) / (hi - lo || 1)) * (base - top);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const last = points.length - 1;
  return (
    <svg className={s.trend} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img" aria-label={points.map((p) => `${p.term} ${p.value}%`).join(", ")}>
      <line x1="0" x2={W} y1={base} y2={base} stroke="var(--border-subtle)" strokeWidth="1.5" />
      <path d={`${line} L${x(last)} ${base} L${x(0)} ${base} Z`} fill="var(--tint-teal)" />
      <path d={line} fill="none" stroke="var(--bg-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle key={p.term} cx={x(i)} cy={y(p.value)} r={i === last ? 5 : 3.5} fill={i === last ? "var(--bg-accent)" : "var(--bg-surface)"} stroke="var(--bg-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      ))}
      <text x={x(0) - 11} y={y(points[0].value) - 8} className={s.trendValue}>{`${points[0].value}%`}</text>
      <text x={x(last) - 12} y={Math.max(9, y(points[last].value) - 9)} className={cx(s.trendValue, s.trendAccent)}>{`${points[last].value}%`}</text>
      {points.map((p, i) => (
        <text key={p.term} x={x(i)} y={height - 2} textAnchor="middle" className={cx(s.trendTerm, i === last && s.trendAccent)}>
          {p.term}
        </text>
      ))}
    </svg>
  );
}

/* ---------- Anonymous mention ---------- */

export const MentionCard = ({ m }: { m: { date: string; text: string; tag: string; href: string } }) => (
  <div className={s.mention}>
    <p className={s.mentionHead}>
      <Icon name="send" size={16} />
      <b>Anonymous</b>
      <span>{m.date}</span>
    </p>
    <p className={s.mentionText}>{m.text}</p>
    <p className={s.mentionFoot}>
      <Tag tone="neutral">{m.tag}</Tag>
      <Link href={m.href} className={s.cardLink}>
        Open post
      </Link>
      <Icon name="external" size={16} />
    </p>
  </div>
);

/* ---------- Empty ---------- */

export function Empty({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className={s.empty}>
      <Face size={96} />
      <h2 className={s.emptyTitle}>{title}</h2>
      {children && <p className={s.emptyText}>{children}</p>}
    </div>
  );
}
