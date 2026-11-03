import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { FileType } from "@/core/files";
import { SITE_URL } from "@/core/links";
import { Button as KitButton, CourseCard as KitCourseCard, EmptyState, Face as KitFace, FeedFiles, FeedItem, FeedMark, FileRow as KitFileRow, RatingRing, RatingStrip as KitRatingStrip, Score as KitScore, Tag as KitTag, type FeedMarkAttendance, type FeedMarkGrade, type FeedType, type ScoreTier } from "@/ui/components";
import { Icon, type IconName } from "./Icon";
import { Prefetch } from "./Prefetch";
import s from "./parts.module.css";

/**
 * Desktop glue around the UI kit (@/ui/components): the kit draws the pieces,
 * these wrappers add what desktop needs on top — key hints, `data-key` for the
 * keyboard layer, list cursors — and take the screens' display shapes.
 */
export { Icon, s as css };
export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

/* ---------- Keys ---------- */

/** Quiet key hint ("T", "⌘K"). */
export const Hint = ({ children, className }: { children: ReactNode; className?: string }) => <kbd className={cx(s.hint, className)}>{children}</kbd>;

/** Real keycaps in a row, for combinations ("⇧", "R"). */
export const Keys = ({ keys, className }: { keys: string[]; className?: string }) => (
  <span className={cx(s.keys, className)}>
    {keys.map((k) => (
      <kbd key={k} className={s.key}>
        {k}
      </kbd>
    ))}
  </span>
);

/**
 * Gives a key to whatever control it wraps (the keyboard layer clicks the first
 * link or button inside). Two-key sequences are gone: an old "g f" binds plain "f".
 */
export const KeyTo = ({ k, children }: { k: string; children: ReactNode }) => (
  <span data-key={k.replace(/^g (?=\S)/, "")} className={s.contents}>
    {children}
  </span>
);

/* ---------- Buttons ---------- */

type Look = { variant?: "primary" | "secondary" | "ghost"; size?: "m" | "s"; icon?: ReactNode; loading?: boolean };

/** Kit Button; `keyName` binds a keyboard key to it. */
export function Button({ children, keyName, variant, size, icon, ...rest }: Look & { keyName?: string; children: ReactNode } & Omit<ComponentProps<"button">, "children">) {
  const b = <KitButton label={children} variant={variant} size={size} icon={icon} {...rest} />;
  return keyName ? <KeyTo k={keyName}>{b}</KeyTo> : b;
}

export function ButtonLink({ children, href, keyName, variant, size, icon }: Look & { href: string; keyName?: string; children: ReactNode }) {
  const b = <KitButton href={href} label={children} variant={variant} size={size} icon={icon} />;
  return keyName ? <KeyTo k={keyName}>{b}</KeyTo> : b;
}

/** For the two links the kit Button can't be: downloads and new tabs. Same key-cap look. */
export const AnchorButton = ({ variant = "primary", className, ...rest }: { variant?: "primary" | "secondary" } & ComponentProps<"a">) => (
  <a className={cx(s.btn, variant === "primary" && s.primary, className)} {...rest} />
);

/** Desktop share: Telegram's share link to the page (the page's preview is the share card). */
export const shareHref = (pagePath: string, text?: string) =>
  `https://t.me/share/url?url=${encodeURIComponent(`${SITE_URL}${pagePath}`)}${text ? `&text=${encodeURIComponent(text)}` : ""}`;

/* ---------- Tags and stickers ---------- */

export const Tag = ({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "neutral" | "dark" }) => <KitTag tone={tone}>{children}</KitTag>;

/** Tint for a recommend / pressed-F share: teal from 75, mustard from 50, rust below (kit tiers). */
export const toneOf = (pct: number | null | undefined) => (pct == null ? s.toneSurface : pct >= 75 ? s.toneHigh : pct >= 50 ? s.toneMid : s.toneLow);

export const Pct = ({ value, suffix = "" }: { value: number | null; suffix?: string }) => (value == null ? null : <span className={cx(s.pct, toneOf(value))}>{`${value}%${suffix}`}</span>);

export const Ring = ({ pct, size = 20 }: { pct: number; size?: number }) => <RatingRing split={pct} size={size} />;

export type Strip = { recommendPct: number | null; hours: number | null; difficulty: number | null; difficultyWord: string | null };

/** App/RatingStrip from the kit. Hidden under 5 ratings. */
export function RatingStrip({ strip, className }: { strip: Strip; className?: string }) {
  if (strip.recommendPct == null) return null;
  return (
    <KitRatingStrip
      className={className}
      recommend={{ pct: strip.recommendPct }}
      hours={strip.hours}
      difficulty={strip.difficulty != null ? { value: strip.difficulty, word: strip.difficultyWord ?? "" } : null}
    />
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

/* ---------- Faces and scores ---------- */

/** Drawn faces only, never photos (kit Face: default face without a drawing). */
export const Face = ({ src, size, name }: { src?: string | null; size: number; name?: string }) => <KitFace src={src} size={size} name={name} />;

export type Tier = "High" | "Mid" | "Low" | "None";
const KIT_TIER: Record<Tier, ScoreTier> = { High: "high", Mid: "mid", Low: "low", None: "none" };
export const Score = ({ value, tier }: { value: number | string; tier: Tier }) => <KitScore value={String(value)} tier={KIT_TIER[tier]} />;

/* ---------- Files ---------- */

export type FileRowData = {
  id: string;
  title: string;
  type: FileType;
  date: string;
  /** Where it came from; the label is "LMS", "From students" or the uploader's name. */
  source: "lms" | "students";
  from: string;
  href: string;
  course?: string;
};

export function FileRow({ file, hideCourse }: { file: FileRowData; hideCourse?: boolean }) {
  return (
    <Prefetch href={file.href}>
      <KitFileRow
        title={file.title}
        type={file.type}
        course={hideCourse ? undefined : file.course}
        date={file.date}
        source={{ label: file.from, kind: file.source === "lms" ? "lms" : "channel" }}
        href={file.href}
      />
    </Prefetch>
  );
}

/* ---------- Notifications ---------- */

export type FeedKind = "announcement" | "grade" | "absence" | "file" | "deadline" | "anonymous" | "upload" | "system";
const FEED_TYPE: Record<FeedKind, FeedType> = { announcement: "announcement", system: "announcement", grade: "grade", upload: "files", file: "files", absence: "absence", anonymous: "anonymous", deadline: "deadline" };
const FEED_LOOK: Record<FeedKind, { icon: IconName; bg: string }> = {
  announcement: { icon: "mail", bg: "var(--tint-teal)" },
  system: { icon: "mail", bg: "var(--tint-teal)" },
  grade: { icon: "check", bg: "var(--tint-moss)" },
  upload: { icon: "file", bg: "var(--tint-plum)" },
  absence: { icon: "users", bg: "var(--tint-rust)" },
  anonymous: { icon: "send", bg: "var(--tint-plum)" },
  file: { icon: "file", bg: "var(--tint-plum)" },
  deadline: { icon: "clock", bg: "var(--tint-mustard)" },
};

/** A new-files item's files: at most three (each opens the file) and "and N more" to the course's files. */
export type FeedFilesVM = { shown: Array<{ id: string; title: string; type: FileType; typeLabel: string; href: string }>; more: number; moreHref: string | null };

/** A grade or attendance item's mark: the score in its tier, or the class with its mark and the absences left; `href` is the course's progress. */
export type FeedMarkVM = { grade: FeedMarkGrade | null; attendance: FeedMarkAttendance | null; href: string | null };

/** Kit App/FeedItem as a link (Today's feed card); new files list their files under the title, each a link; grades and absences show their mark. */
export const FeedLink = ({ kind, title, meta, unread, href, files, mark }: { kind: FeedKind; title: string; meta: string; unread: boolean; href: string; files?: FeedFilesVM | null; mark?: FeedMarkVM | null }) => (
  <FeedItem type={FEED_TYPE[kind] ?? "announcement"} title={title} meta={meta} unread={unread} href={href}>
    {files ? <FeedFiles files={files.shown} more={files.more} moreHref={files.moreHref} /> : mark ? <FeedMark grade={mark.grade} attendance={mark.attendance} href={mark.href} /> : null}
  </FeedItem>
);

/** Selectable feed row for the split view (the kit item has no selected state or button form). Same measurements. */
export function FeedRow({ kind, title, meta, unread, selected, files, mark, ...rest }: { kind: FeedKind; title: string; meta: string; unread: boolean; selected?: boolean; files?: FeedFilesVM | null; mark?: FeedMarkVM | null } & Omit<ComponentProps<"button">, "title">) {
  const look = FEED_LOOK[kind] ?? FEED_LOOK.system;
  return (
    <button type="button" className={cx(s.feed, selected && s.feedSelected, (files || mark) && s.feedTop)} data-nav-item aria-current={selected || undefined} {...rest}>
      <span className={s.badge} style={{ background: look.bg }}>
        <Icon name={look.icon} size={20} />
      </span>
      <span className={s.feedText}>
        <span className={s.feedTitle}>{title}</span>
        <span className={s.feedMeta}>{meta}</span>
        {/* The row is a button: the files and marks show here, and open from the pane. */}
        {files ? <FeedFiles files={files.shown} more={files.more} links={false} className={s.feedFiles} /> : null}
        {!files && mark ? <FeedMark grade={mark.grade} attendance={mark.attendance} links={false} className={s.feedFiles} /> : null}
      </span>
      {unread && <span className={s.unread} aria-label="Unread" />}
    </button>
  );
}

/* ---------- Course card ---------- */

export type CourseCardData = { code: string; name: string; href: string; recommendPct: number | null; teacher: { name: string; face: string | null } | null; line: string };

export const CourseCard = ({ c }: { c: CourseCardData }) => (
  <Prefetch href={c.href}>
    <KitCourseCard code={c.code} name={c.name} href={c.href} line={c.line} teacher={c.teacher ?? undefined} recommend={c.recommendPct != null ? { pct: c.recommendPct } : undefined} />
  </Prefetch>
);

/* ---------- Anonymous mention ---------- */

/** The whole card opens the post in Telegram (a new tab on desktop). */
export const MentionCard = ({ m }: { m: { date: string; text: string; tag: string; href: string } }) => (
  <a href={m.href} target="_blank" rel="noopener" className={cx(s.mention, s.mentionLink)} aria-label={`Open the Anonymous post: ${m.text.slice(0, 80)}`}>
    <p className={s.mentionHead}>
      <Icon name="send" size={16} />
      <b>Anonymous</b>
      <span>{m.date}</span>
    </p>
    <p className={s.mentionText}>{m.text}</p>
    <p className={s.mentionFoot}>
      <Tag tone="neutral">{m.tag}</Tag>
      <span className={s.cardLink}>Open post</span>
      <Icon name="external" size={16} />
    </p>
  </a>
);

/* ---------- Empty ---------- */

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => <EmptyState title={title} text={children} />;
