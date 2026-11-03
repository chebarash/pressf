import { setTheme } from "@/platform/PlatformProvider";
import { NAV } from "@/ui/shell/nav";

/**
 * Tiny event bus between the desktop sidebar and the global overlays, so the
 * sidebar's "Search ⌘K" and "Shortcuts ?" buttons can open them without a provider.
 */
export const PALETTE_EVENT = "pressf:palette";
export const SHORTCUTS_EVENT = "pressf:shortcuts";

export const openPalette = (query = "") => window.dispatchEvent(new CustomEvent(PALETTE_EVENT, { detail: { query } }));
export const openShortcuts = () => window.dispatchEvent(new CustomEvent(SHORTCUTS_EVENT));

/** ⇧D: flip light/dark through the platform (same storage the boot script reads). */
export function toggleTheme() {
  const current = document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  setTheme(current === "dark" ? "light" : "dark");
}

/** The one-letter section keys: the sidebar's own table (src/ui/shell/nav.ts). */
export const GO_TO: Array<{ key: string; label: string; href: string }> = NAV.filter((n) => n.badge !== "new").map((n) => ({ key: n.key, label: n.label, href: n.href }));

/** True while the user types in a field: shortcuts never fire then. */
export const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  if (!t || !t.tagName) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
};
