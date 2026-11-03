"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { GO_TO, isTyping, openPalette, openShortcuts, toggleTheme } from "./bus";
import { isLetterKey, keyName } from "@/platform/keys";

/**
 * Desktop keyboard, one shortcut per action: ⌘K / Ctrl+K for search and
 * commands, one plain letter per section (the sidebar's table in
 * src/ui/shell/nav.ts, no prefix), ? for the shortcuts sheet, ⇧D for the
 * theme, J/K (and ↑/↓) inside lists, and page keys. Plain keys never fire while
 * typing in a field or with ⌘/Ctrl/Alt held, and are read from the physical key
 * (any keyboard layout).
 *
 * Pages declare their own keys in markup, no wiring needed:
 * - `data-key="r"` (or "shift+r", "Enter", "mod+Enter", "ArrowLeft", "Escape", "/") on a
 *   link or button: the key clicks it (an input gets focus instead). A page key
 *   never reuses a section letter (tests/unit/shortcuts.test.ts checks).
 * - `data-nav-list` around `data-nav-item` elements: J/K (and ↑/↓ inside it, or anywhere
 *   when the list also has `data-nav-arrows`) move focus; with
 *   `data-nav-list="select"` moving also clicks the item (split views follow the cursor).
 * - an open modal marks itself `data-keyboard-scope`; global keys pause while it is open.
 */
export function DesktopKeyboard() {
  const router = useRouter();

  useEffect(() => {
    const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || (el as HTMLElement).getClientRects().length > 0;
    const CONTROL = "a, button, input, textarea, select";
    // A `data-key` sits on the control itself or on a wrapper around a kit component.
    const byKey = (key: string) =>
      [...document.querySelectorAll<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)]
        .map((el) => (el.matches(CONTROL) ? el : el.querySelector<HTMLElement>(CONTROL)))
        .find((el): el is HTMLElement => !!el && visible(el) && !(el as HTMLButtonElement).disabled);

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
      // ⌘K / Ctrl+K works everywhere, even in fields.
      if (mod && !e.altKey && keyName(e) === "k") {
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

      const name = keyName(e);
      const key = isLetterKey(e) && e.shiftKey ? `shift+${name}` : name;

      if (key === "?") {
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
      const go = GO_TO.find((g) => g.key === key);
      if (go) {
        e.preventDefault();
        router.push(go.href);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}
