"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { GO_TO, isTyping, openPalette, openShortcuts, toggleTheme } from "./bus";

/**
 * Desktop keyboard: G-chords between sections, ⌘K / F for the palette, ? for the
 * shortcuts sheet, ⇧D for the theme, J/K (and ↑/↓) inside lists, and page keys.
 *
 * Pages declare their own keys in markup, no wiring needed:
 * - `data-key="r"` (or "shift+r", "Enter", "mod+Enter", "ArrowLeft", "Escape", "/", "g f") on a
 *   link or button: the key clicks it (an input gets focus instead).
 * - `data-nav-list` around `data-nav-item` elements: J/K (and ↑/↓ inside it, or anywhere
 *   when the list also has `data-nav-arrows`) move focus; with
 *   `data-nav-list="select"` moving also clicks the item (split views follow the cursor).
 * - an open modal marks itself `data-keyboard-scope`; global keys pause while it is open.
 */
export function DesktopKeyboard() {
  const router = useRouter();

  useEffect(() => {
    let chord: number | null = null;
    let chordTimer = 0;

    const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || (el as HTMLElement).getClientRects().length > 0;
    const byKey = (key: string) => [...document.querySelectorAll<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)].find(visible);

    const move = (dir: 1 | -1) => {
      const active = document.activeElement as HTMLElement | null;
      const list =
        active?.closest<HTMLElement>("[data-nav-list]") ??
        document.querySelector<HTMLElement>("[data-nav-list][data-nav-arrows]") ??
        [...document.querySelectorAll<HTMLElement>("[data-nav-list]")].find(visible);
      if (!list) return false;
      const items = [...list.querySelectorAll<HTMLElement>("[data-nav-item]")].filter(visible);
      if (!items.length) return false;
      const current = items.findIndex((i) => i === active || i.contains(active));
      const fallback = items.findIndex((i) => i.getAttribute("aria-current") === "true");
      const from = current >= 0 ? current : fallback;
      const next = items[Math.max(0, Math.min(items.length - 1, from < 0 ? 0 : from + dir))];
      next.focus({ preventScroll: false });
      next.scrollIntoView({ block: "nearest" });
      if (list.dataset.navList === "select") next.click();
      return true;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      // ⌘K works everywhere, even in fields.
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (document.querySelector("[data-keyboard-scope]")) return;
      if (isTyping(e.target)) return;
      if (mod && e.key === "Enter") {
        const target = byKey("mod+Enter");
        if (target) {
          e.preventDefault();
          target.click();
        }
        return;
      }
      if (e.altKey || mod) return;

      const letter = e.key.length === 1 && /[a-z]/i.test(e.key);
      const key = e.key.length === 1 ? (letter && e.shiftKey ? `shift+${e.key.toLowerCase()}` : e.key.toLowerCase()) : e.key;

      if (chord !== null) {
        window.clearTimeout(chordTimer);
        chord = null;
        const local = byKey(`g ${key}`);
        if (local) {
          e.preventDefault();
          local.click();
          return;
        }
        const go = GO_TO.find((g) => g.key === key);
        if (go) {
          e.preventDefault();
          router.push(go.href);
        }
        return;
      }

      if (key === "g") {
        chord = 1;
        chordTimer = window.setTimeout(() => (chord = null), 1200);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        openShortcuts();
        return;
      }
      if (key === "shift+d") {
        e.preventDefault();
        toggleTheme();
        return;
      }
      if (key === "j" || key === "ArrowDown" || key === "k" || key === "ArrowUp") {
        const inList = (document.activeElement as HTMLElement | null)?.closest("[data-nav-list]");
        // Arrows keep scrolling the page unless a list opts in with data-nav-arrows.
        if ((key === "ArrowDown" || key === "ArrowUp") && !inList && !document.querySelector("[data-nav-arrows]")) return;
        if (move(key === "j" || key === "ArrowDown" ? 1 : -1)) e.preventDefault();
        return;
      }
      if (key === "Enter") {
        // Native Enter on a focused link or button wins.
        const a = document.activeElement;
        if (a && a !== document.body && a.matches("a, button, [role=button], summary")) return;
      }
      const target = byKey(key);
      if (target) {
        e.preventDefault();
        if (target.matches("input, textarea, select")) target.focus();
        else target.click();
        return;
      }
      if (key === "f") {
        e.preventDefault();
        openPalette();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(chordTimer);
    };
  }, [router]);

  return null;
}
