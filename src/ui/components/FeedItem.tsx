import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { CheckIcon, ClockIcon, FileIcon, MailIcon, PinIcon, SendIcon, UsersIcon, type IconProps } from "../icons";
import { cx } from "./cx";
import s from "./FeedItem.module.css";

export type FeedType = "announcement" | "grade" | "absence" | "files" | "deadline" | "room" | "anonymous";

const ICON: Record<FeedType, ComponentType<IconProps>> = {
  announcement: MailIcon,
  grade: CheckIcon,
  absence: UsersIcon,
  files: FileIcon,
  deadline: ClockIcon,
  room: PinIcon,
  anonymous: SendIcon,
};

export type FeedItemProps = {
  /** Figma Type. */
  type: FeedType;
  title: string;
  meta?: string;
  unread?: boolean;
  href?: string;
  /** Without `href`: the title row is a button (opens a sheet or pane). Used with `children`. */
  onClick?: () => void;
  /** Shown under the title row, inside the card (the files of a "new files" item). Its own links stay clickable. */
  children?: ReactNode;
  className?: string;
};

/** Notifications feed row (Figma App/FeedItem 4180:7810). */
export function FeedItem({ type, title, meta, unread, href, onClick, children, className }: FeedItemProps) {
  const Icon = ICON[type];
  const body = (
    <>
      <span className={cx(s.badge, s[type])} aria-hidden>
        <Icon size={20} />
      </span>
      <span className={s.text}>
        <span className={s.title}>{title}</span>
        {meta ? <span className={s.meta}>{meta}</span> : null}
      </span>
      {unread ? (
        <span className={s.unread}>
          <span className={s.sr}>Unread</span>
        </span>
      ) : null}
    </>
  );
  if (children) {
    const head = href ? (
      <Link href={href} className={s.head}>
        {body}
      </Link>
    ) : onClick ? (
      <button type="button" className={s.head} onClick={onClick}>
        {body}
      </button>
    ) : (
      <div className={s.head}>{body}</div>
    );
    return (
      <div className={cx(s.item, s.stacked, className)}>
        {head}
        <div className={s.extra}>{children}</div>
      </div>
    );
  }
  return href ? (
    <Link href={href} className={cx(s.item, className)}>
      {body}
    </Link>
  ) : (
    <div className={cx(s.item, className)}>{body}</div>
  );
}
