import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ChevronRightIcon, SpinnerIcon } from "../icons";
import { cx, type ForcedState } from "./cx";
import s from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "m" | "s";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Figma Variant: Primary · Secondary · Ghost. */
  variant?: ButtonVariant;
  /** Figma Size: M (48 px) · S (36 px). */
  size?: ButtonSize;
  label: ReactNode;
  /** Trailing icon. `true` = chevron-right (Figma default), `false` = none. */
  icon?: ReactNode | boolean;
  /** Figma State=Loading: spinner in place of the icon, not clickable. */
  loading?: boolean;
  /** Render as a link. */
  href?: string;
  /** Catalogue only: force a visual state. */
  state?: ForcedState;
};

/** Button from Figma 02 Components (4007:1221): Primary/Secondary/Ghost × M/S × states. */
export function Button({ variant = "primary", size = "m", label, icon = false, loading, href, state, className, disabled, type = "button", ...rest }: ButtonProps) {
  const iconSize = size === "m" ? 20 : 16;
  const trailing = loading ? (
    <SpinnerIcon size={16} className={s.spin} />
  ) : icon === true ? (
    <ChevronRightIcon size={iconSize} />
  ) : (
    icon || null
  );
  const cls = cx(s.btn, s[variant], size === "s" && s.s, size === "m" ? "t-label-lg" : "t-label-md", className);
  const body = (
    <>
      <span>{label}</span>
      {trailing ? <span className={s.icon}>{trailing}</span> : null}
    </>
  );
  if (href && !disabled) {
    return (
      <Link href={href} className={cls} data-state={state} aria-busy={loading || undefined}>
        {body}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} data-state={state} disabled={disabled} aria-busy={loading || undefined} {...rest}>
      {body}
    </button>
  );
}
