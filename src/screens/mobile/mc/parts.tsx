import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { AttendanceStatus } from "@/core/attendance";
import { fontVars } from "./fonts";
import { ChevronRightIcon } from "./kit";
import s from "./mc.module.css";

export const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

/** Screen root: page background, tokens, fonts. */
export function Screen({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx(s.screen, fontVars, className)} style={style}>
      {children}
    </div>
  );
}

export const Chevron = () => <ChevronRightIcon size={18} className={s.chev} aria-hidden />;

/** Figma Stat (4008:1457): serif number over a small label. */
export function Stat({ value, label, size = "sm" }: { value: string; label: string; size?: "sm" | "kpi" }) {
  return (
    <div className={cx(s.stat, size === "kpi" && s.kpi)}>
      <p className={cx(s.statValue, size === "sm" ? "t-display-sm" : s.kpiValue)}>{value}</p>
      <p className={cx(s.statLabel, size === "sm" ? "t-body-sm" : s.t12m)}>{label}</p>
    </div>
  );
}

/** "Absences 9 of 15 ……… 6 left" plus the bar (teal, mustard from half, red when 2 or fewer remain). */
export function Absences({ a, big }: { a: { missed: number; left: number; limit: number; status: AttendanceStatus }; big?: boolean }) {
  const width = a.limit ? Math.min(100, Math.round((a.missed / a.limit) * 100)) : 0;
  const tone = a.status !== "ok" ? s.fillDanger : a.limit > 0 && a.missed / a.limit >= 0.5 ? s.fillLow : undefined;
  const leftText = a.status === "over" ? "Over the limit" : `${a.left} left`;
  return (
    <>
      <div className={s.absRow}>
        <p className={cx(s.grow, big ? s.t13m : s.t12m, !big && s.soft)}>
          Absences {a.missed} of {a.limit}
        </p>
        <p className={cx(big ? s.t13sb : s.t12sb, a.status !== "ok" && !big && s.lowText)}>{leftText}</p>
      </div>
      <div className={s.bar} role="meter" aria-valuemin={0} aria-valuemax={a.limit} aria-valuenow={a.missed} aria-label="Absences used">
        <span className={cx(s.fill, tone)} style={{ width: `${width}%` }} />
      </div>
    </>
  );
}

/** A tappable row card with a chevron. */
export function RowLink({ href, children, quiet, className, style }: { href: string; children: ReactNode; quiet?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <Link href={href} prefetch className={cx(s.rowCard, quiet && s.quiet, s.pressable, className)} style={style}>
      {children}
      <Chevron />
    </Link>
  );
}
