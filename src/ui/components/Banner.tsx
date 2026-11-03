import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { cx } from "./cx";
import s from "./Banner.module.css";

export type BannerProps = {
  /** Figma Tone: Info (teal soft) · Warning (mustard soft). */
  tone?: "info" | "warning";
  children: ReactNode;
  /** Action line under the text, e.g. "Compare", "Retry". */
  action?: { label: string; href?: string; onClick?: MouseEventHandler<HTMLButtonElement> };
  className?: string;
};

/** Status banner on Today (Figma StatusBannerMobile 4024:1232, used in 9.4). */
export function Banner({ tone = "info", children, action, className }: BannerProps) {
  return (
    <div className={cx(s.banner, s[tone], className)} role={tone === "warning" ? "alert" : "status"}>
      <p className="t-body-sm">{children}</p>
      {action ? (
        action.href ? (
          <Link prefetch href={action.href} className={cx(s.action, "t-label-md")}>
            {action.label}
          </Link>
        ) : (
          <button type="button" className={cx(s.action, "t-label-md")} onClick={action.onClick}>
            {action.label}
          </button>
        )
      ) : null}
    </div>
  );
}
