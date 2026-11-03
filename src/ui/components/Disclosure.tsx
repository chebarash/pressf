"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "../icons";
import { cx } from "./cx";
import s from "./Disclosure.module.css";

export type DisclosureProps = {
  /** The always-visible head (title, meta). A chevron is added after it unless `chevron` is null. */
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  /** "down" turns over when open (folds), "right" turns down (rows that open in place). */
  chevron?: "down" | "right" | null;
  /** Replaces the chevron (e.g. a "This week" tag), shown open or closed. */
  trailing?: ReactNode;
  className?: string;
  openClassName?: string;
  headClassName?: string;
  bodyClassName?: string;
};

/**
 * A fold that opens in place: a real button (click, tap, Enter, Space) with
 * aria-expanded, and the body below it. Used for syllabus folds and week rows on
 * the course page (mobile 4.2 and desktop D4) instead of <details>, which some
 * Telegram webviews don't toggle when the summary is a flex row.
 */
export function Disclosure({ summary, children, defaultOpen = false, chevron = "down", trailing, className, openClassName, headClassName, bodyClassName }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const Icon = chevron === "right" ? ChevronRightIcon : ChevronDownIcon;
  return (
    <div className={cx(className, open && openClassName)} data-open={open || undefined}>
      <button type="button" className={cx(s.head, headClassName)} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {summary}
        {trailing ?? (chevron ? <Icon size={18} className={cx(s.chev, chevron === "right" ? s.right : s.down)} aria-hidden /> : null)}
      </button>
      {open ? (
        <div id={id} className={bodyClassName}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
