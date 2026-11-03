import Link from "next/link";
import type { ComponentType } from "react";
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
  className?: string;
};

/** Notifications feed row (Figma App/FeedItem 4180:7810). */
export function FeedItem({ type, title, meta, unread, href, className }: FeedItemProps) {
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
  return href ? (
    <Link href={href} className={cx(s.item, className)}>
      {body}
    </Link>
  ) : (
    <div className={cx(s.item, className)}>{body}</div>
  );
}
