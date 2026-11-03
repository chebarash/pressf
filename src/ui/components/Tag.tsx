import type { ReactNode } from "react";
import { cx } from "./cx";
import s from "./Tag.module.css";

export type TagTone = "neutral" | "accent" | "computing" | "engineering" | "management" | "humanities" | "medicine" | "dark";

/** Small uppercase label (Figma Tag 4007:1287), e.g. MATH111, LECTURE 15, MIDTERM. */
export function Tag({ children, tone = "neutral", className }: { children: ReactNode; tone?: TagTone; className?: string }) {
  return <span className={cx(s.tag, s[tone], "t-label-xs", className)}>{children}</span>;
}
