import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";
import { cx, type ForcedState } from "./cx";
import s from "./Tabs.module.css";

export type TabItem = { label: string; href?: string; active?: boolean; value?: string };

type TabProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  /** Figma State=Active: ink pill. */
  active?: boolean;
  href?: string;
  /** Figma height: 40 (section tabs) or 44 (day picker in 3.1). */
  size?: "m" | "l";
  state?: ForcedState;
};

/** One pill tab (Figma Tab 4008:1433). Renders a Link with href, else a button (pass onClick from a client parent). */
export function Tab({ label, active, href, size = "m", state, className, type = "button", ...rest }: TabProps) {
  const cls = cx(s.tab, size === "l" && s.l, active && s.active, "t-label-md", className);
  if (href) {
    return (
      <Link href={href} className={cls} aria-current={active ? "page" : undefined} data-state={state} data-haptic="select">
        {label}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} aria-pressed={active ?? false} data-state={state} {...rest}>
      {label}
    </button>
  );
}

/**
 * Row of pill tabs / segmented control (Figma Tab; day picker "Mon … Fri" in 3.1).
 * `spread` distributes them across the width like the day picker.
 */
export function Tabs({ items, label, size, spread, className }: { items: TabItem[]; label: string; size?: "m" | "l"; spread?: boolean; className?: string }) {
  return (
    <nav aria-label={label} className={cx(s.tabs, spread && s.spread, className)}>
      {items.map((t) => (
        <Tab key={t.value ?? t.label} label={t.label} href={t.href} active={t.active} size={size} />
      ))}
    </nav>
  );
}
