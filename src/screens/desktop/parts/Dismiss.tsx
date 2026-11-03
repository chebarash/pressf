"use client";

import { useState, type ReactNode } from "react";

/**
 * Hides its children for this visit when the "Later"-style button inside is pressed.
 * The button is any element with `data-dismiss`. A server action can persist it later.
 */
export function Dismissible({ children, className, onDismiss }: { children: ReactNode; className?: string; onDismiss?: () => void }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div
      className={className}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-dismiss]")) {
          setHidden(true);
          onDismiss?.();
        }
      }}
    >
      {children}
    </div>
  );
}
