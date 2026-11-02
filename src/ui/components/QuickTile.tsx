import Link from "next/link";
import type { ReactNode } from "react";
import { ClockIcon } from "../icons";
import { cx } from "./cx";
import s from "./QuickTile.module.css";

export type QuickTileProps = {
  label: string;
  /** Live line under the label, e.g. "Next 10:00". */
  info?: string;
  /** 18 px icon; clock by default. */
  icon?: ReactNode;
  /** Figma Tone: Default · Accent (Scan QR during a class) · Warning (needs attention). */
  tone?: "default" | "accent" | "warning";
  href?: string;
  className?: string;
};

/** Today quick-access tile (Figma App/QuickTile v2 4208:8113). */
export function QuickTile({ label, info, icon, tone = "default", href, className }: QuickTileProps) {
  const body = (
    <>
      <span className={s.box} aria-hidden>
        {icon ?? <ClockIcon size={18} />}
      </span>
      <span className={s.label}>{label}</span>
      {info ? <span className={s.info}>{info}</span> : null}
    </>
  );
  const cls = cx(s.tile, s[tone], className);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
