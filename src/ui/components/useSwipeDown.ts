"use client";

import { useEffect, type RefObject } from "react";

/**
 * Swipe a bottom sheet down to close it. The sheet follows the finger; past a
 * quarter of its height (or 120px) or on a quick flick it slides away and
 * `onClose` runs, otherwise it springs back. A drag that starts inside
 * content scrolled away from its top scrolls that content instead.
 * Touch only (a mouse keeps the scrim, grabber and Esc); transform only.
 */
export function useSwipeDown(ref: RefObject<HTMLElement | null>, onClose: (() => void) | undefined, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !onClose || !enabled) return;
    let startY = 0;
    let startT = 0;
    let dy = 0;
    let dragging = false;
    let armed = false;

    const scrolledAway = (target: EventTarget | null) => {
      for (let n = target as HTMLElement | null; n && n !== el.parentElement; n = n.parentElement) {
        if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight) return true;
        if (n === el) break;
      }
      return false;
    };
    const settle = (to: string, after?: () => void) => {
      el.style.transition = "transform var(--motion-base, 180ms) var(--ease-standard, ease-out)";
      el.style.transform = to;
      const done = () => {
        el.style.transition = "";
        if (to === "") el.style.transform = "";
        after?.();
      };
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) done();
      else el.addEventListener("transitionend", done, { once: true });
    };

    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      armed = !scrolledAway(e.target);
      dragging = false;
      dy = 0;
      startY = e.touches[0].clientY;
      startT = performance.now();
    };
    const move = (e: TouchEvent) => {
      if (!armed) return;
      const d = e.touches[0].clientY - startY;
      if (!dragging) {
        if (d < 6) {
          if (d < -6) armed = false; // an upward move is a scroll
          return;
        }
        dragging = true;
        el.style.transition = "none";
      }
      dy = Math.max(0, d);
      e.preventDefault();
      el.style.transform = `translateY(${dy}px)`;
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      armed = false;
      const speed = dy / Math.max(1, performance.now() - startT);
      if (dy > Math.min(120, el.offsetHeight / 4) || (speed > 0.6 && dy > 24)) settle("translateY(100%)", onClose);
      else settle("");
    };

    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      el.style.transform = "";
      el.style.transition = "";
    };
  }, [ref, onClose, enabled]);
}
