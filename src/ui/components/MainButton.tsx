import type { ButtonHTMLAttributes, MouseEventHandler } from "react";
import { SpinnerIcon } from "../icons";
import { cx } from "./cx";
import s from "./MainButton.module.css";

export type MainButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  /** Figma State: Default · Loading (showProgress) · Disabled · Shine (has_shine_effect). */
  state?: "default" | "loading" | "disabled" | "shine";
  /** Stick to the bottom of the viewport (web fallback for Telegram's native button). */
  sticky?: boolean;
};

/**
 * Web/desktop fallback for Telegram's MainButton (Figma TG/MainButton 4164:3243).
 * Inside Telegram use the native button via the platform bridge instead.
 */
export function MainButton({ label, state = "default", sticky, className, type = "button", ...rest }: MainButtonProps) {
  const loading = state === "loading";
  return (
    <div className={cx(s.bar, sticky && s.sticky, className)}>
      <button type={type} className={cx(s.main, state === "shine" && s.shine)} disabled={state === "disabled"} aria-busy={loading || undefined} {...rest}>
        {loading ? <SpinnerIcon size={22} className={s.spin} /> : label}
      </button>
    </div>
  );
}

export type BottomButtonsProps = {
  main: { label: string; onClick?: MouseEventHandler<HTMLButtonElement>; type?: "button" | "submit"; state?: "default" | "loading" | "disabled" };
  /** Telegram SecondaryButton, position left (Later / Skip). */
  secondary: { label: string; onClick?: MouseEventHandler<HTMLButtonElement> };
  sticky?: boolean;
  className?: string;
};

/** Secondary + Main pair (Figma TG/BottomButtons 4172:5985), web fallback. */
export function BottomButtons({ main, secondary, sticky, className }: BottomButtonsProps) {
  const loading = main.state === "loading";
  return (
    <div className={cx(s.bar, s.pair, sticky && s.sticky, className)}>
      <button type="button" className={s.secondary} onClick={secondary.onClick}>
        {secondary.label}
      </button>
      <button type={main.type ?? "button"} className={s.main} onClick={main.onClick} disabled={main.state === "disabled"} aria-busy={loading || undefined}>
        {loading ? <SpinnerIcon size={22} className={s.spin} /> : main.label}
      </button>
    </div>
  );
}
