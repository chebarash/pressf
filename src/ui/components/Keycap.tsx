import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx, type ForcedState } from "./cx";
import s from "./Keycap.module.css";

export type KeycapProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: ReactNode;
  /** Figma Size: L 136 · M 64 · S 40. */
  size?: "l" | "m" | "s";
  /** Figma State=Selected (accent fill). Sets aria-pressed. */
  selected?: boolean;
  state?: ForcedState;
};

const TYPE = { l: "t-display-lg", m: "t-display-xs", s: "t-label-md" } as const;

/** A single square key (Figma Keycap 4007:1110), e.g. the F key or 1–5 rating keys. */
export function Keycap({ label, size = "m", selected, state, className, type = "button", ...rest }: KeycapProps) {
  return (
    <button
      type={type}
      className={cx(s.key, s[size], TYPE[size], selected && s.selected, className)}
      aria-pressed={selected === undefined ? undefined : selected}
      data-state={state}
      {...rest}
    >
      {label}
    </button>
  );
}
