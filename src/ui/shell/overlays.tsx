"use client";

import { useEffect, useRef } from "react";

/**
 * Bottom sheet over a scrim (sign-in, alerts, home screen). The grabber and the
 * scrim close it when `onClose` is given; the bottom buttons stay above it.
 */
export function Sheet({ label, onClose, children }: { label: string; onClose?: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="sh-scrim" onClick={onClose} />
      <div className="sh-sheet" role="dialog" aria-modal="true" aria-label={label} ref={ref} tabIndex={-1}>
        <div className="sh-sheet__grab" aria-hidden="true" />
        {children}
      </div>
    </>
  );
}

/** A centred desktop dialog (D19) with Esc to close. */
export function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="sh-scrim" onClick={onClose} />
      <div className="sh-dialog-wrap" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="sh-dialog" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
      </div>
    </>
  );
}

/** Dark toast at the bottom (1.11, D20); hides itself after `ms`. */
export function Toast({ children, action, onAction, onClose, ms = 6000 }: { children: React.ReactNode; action?: string; onAction?: () => void; onClose: () => void; ms?: number }) {
  useEffect(() => {
    const timer = setTimeout(onClose, ms);
    return () => clearTimeout(timer);
  }, [onClose, ms]);
  return (
    <div className="sh-toast" role="status">
      <p>{children}</p>
      {action && <button type="button" onClick={() => { onAction?.(); onClose(); }}>{action}</button>}
    </div>
  );
}
