"use client";

import { useEffect, useRef } from "react";

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/**
 * Single-key shortcuts for a screen ("j", "a", "1", "Enter", "Escape", "mod+Enter").
 * Ignored while typing, except Escape and mod+Enter. Disabled when `enabled` is false.
 */
export function useKeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey) return;
      const mod = e.metaKey || e.ctrlKey;
      const name = mod ? `mod+${e.key}` : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (typing(e.target) && name !== "Escape" && name !== "mod+Enter") return;
      if (mod && name !== "mod+Enter") return;
      const fn = ref.current[name];
      if (!fn) return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
