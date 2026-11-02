import type { ReactNode } from "react";
import { CheckIcon } from "../icons";
import { cx } from "./cx";
import s from "./Toast.module.css";

export type ToastProps = {
  children: ReactNode;
  /** Default = ink; error = danger red (Figma 9.4). */
  tone?: "default" | "error";
  /** Leading icon; Figma uses icon/check for every toast. */
  icon?: ReactNode;
  className?: string;
};

/** Toast (Figma 9.4 In-app banners and toasts). Shown at the bottom, above the MainButton, for 3 s. */
export function Toast({ children, tone = "default", icon, className }: ToastProps) {
  return (
    <div className={cx(s.toast, tone === "error" && s.error, className)} role={tone === "error" ? "alert" : "status"}>
      <span className={s.icon}>{icon ?? <CheckIcon size={18} />}</span>
      <p className={s.text}>{children}</p>
    </div>
  );
}

/** Fixed bottom stack for toasts; put <Toast>s inside. Leaves room for the MainButton bar. */
export function ToastViewport({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cx(s.viewport, className)} aria-live="polite">
      {children}
    </div>
  );
}
