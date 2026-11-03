"use client";

import { parentOf } from "@/platform/TelegramBridge";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { GO_TO, isTyping, openPalette, openShortcuts, toggleTheme } from "./bus";
import { NAV_PREFIX } from "@/ui/shell/nav";
import { isLetterKey, keyName } from "@/platform/keys";

/**
 * Desktop keyboard, one shortcut per action: ⌘K / Ctrl+K for search and
 * commands, F then a letter for each section (F T Timetable, the sidebar's
 * table in src/ui/shell/nav.ts), ? for the shortcuts sheet, ⇧D for the theme,
 * J/K (and ↑/↓) inside lists, and page keys. Keys never fire while typing in a
 * field, with ⌘/Ctrl/Alt held or under a modal, and are read from the physical
 * key (any keyboard layout).
 *
 * Pages declare their own keys in markup, no wiring needed:
 * - `data-key="r"` (or "shift+r", "Enter", "mod+Enter", "ArrowLeft", "Escape", "/") on a
 *   link or button: the key clicks it (an input gets focus instead). F is the
 *   section prefix, so a page's `data-key="f"` (Press F, course files) is F F.
 * - `data-nav-list` around `data-nav-item` elements: J/K (and ↑/↓ inside it, or anywhere
 *   when the list also has `data-nav-arrows`) move focus; with
 *   `data-nav-list="select"` moving also clicks the item (split views follow the cursor).
 * - an open modal marks itself `data-keyboard-scope`; global keys pause while it is open.
 */
export function DesktopKeyboard() {
  const router = useRouter();

  useEffect(() => {
    let prefix = false;
    let prefixTimer = 0;
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

      // F then a letter: a section (F T Timetable). F F is the page's own F (Press F, course files).
      if (prefix) {
        prefix = false;
        window.clearTimeout(prefixTimer);
        const target = key === NAV_PREFIX ? byKey(NAV_PREFIX) : null;
        const go = GO_TO.find((g) => g.key === key);
        if (target || go) e.preventDefault();
        if (target) target.click();
        else if (go) router.push(go.href);
        return;
      }
      if (key === NAV_PREFIX) {
        e.preventDefault();
        prefix = true;
        prefixTimer = window.setTimeout(() => (prefix = false), 1500);
        return;
      }

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
      // Esc with nothing open goes back: to the previous screen, or up to the section when the page was opened directly.
      if (key === "Escape" && !document.querySelector("dialog[open], [role=dialog], [aria-modal=true]") && window.location.pathname !== "/") {
        e.preventDefault();
        const nav = (window as unknown as { navigation?: { canGoBack?: boolean } }).navigation;
        const canBack = typeof nav?.canGoBack === "boolean" ? nav.canGoBack : window.history.length > 1;
        if (canBack) router.back();
        else router.push(parentOf(window.location.pathname));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(prefixTimer);
    };
  }, [router]);

  return null;
}
