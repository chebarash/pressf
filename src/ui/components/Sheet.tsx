"use client";

import { useSwipeDown } from "./useSwipeDown";
import { useEffect, useRef, type ReactNode } from "react";
import { XIcon } from "../icons";
import { cx } from "./cx";
import s from "./Sheet.module.css";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible title; shown as the sheet heading when `heading` is true. */
  title: string;
  heading?: boolean;
  /** sheet = bottom sheet (mobile, Figma 3.2 / 4.12); dialog = centered (desktop, Figma D5). */
  variant?: "sheet" | "dialog";
  children: ReactNode;
  /** Pinned under the content, e.g. <BottomButtons> or a <Button>. */
  footer?: ReactNode;
  className?: string;
};

/**
 * Bottom sheet / dialog on the native <dialog> element: focus trap, Esc and
 * scrim click close it, background is inert. Paper sheet with grabber, ink border.
 */
export function Sheet({ open, onClose, title, heading = true, variant = "sheet", children, footer, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Bottom sheets close with a swipe down too (dialogs keep Esc, the scrim and ×).
  useSwipeDown(ref, onClose, variant === "sheet" && open);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx(s.root, s[variant], className)}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={s.panel}>
        {variant === "sheet" ? <span className={s.grabber} aria-hidden /> : null}
        {variant === "dialog" ? (
          <button type="button" className={s.close} onClick={onClose} aria-label="Close">
            <XIcon size={20} />
          </button>
        ) : null}
        {heading ? <h2 className={cx(s.title, "t-display-xs")}>{title}</h2> : null}
        <div className={s.body}>{children}</div>
      </div>
      {footer ? <div className={s.footer}>{footer}</div> : null}
    </dialog>
  );
}
