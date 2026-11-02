/**
 * Tiny event bus between the desktop shell and the global overlays, so the
 * sidebar's "Search ⌘K" and "Shortcuts ?" buttons can open them without a provider.
 */
export const PALETTE_EVENT = "pressf:palette";
export const SHORTCUTS_EVENT = "pressf:shortcuts";

export const openPalette = (query = "") => window.dispatchEvent(new CustomEvent(PALETTE_EVENT, { detail: { query } }));
export const openShortcuts = () => window.dispatchEvent(new CustomEvent(SHORTCUTS_EVENT));

/** Light/dark switch shared with the shell: same `theme` key the root theme script reads. */
export function toggleTheme() {
  const root = document.documentElement;
  const current = root.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch {}
}

/** Where the G-chords go. Same table the shortcuts sheet and the sidebar hints show. */
export const GO_TO: Array<{ key: string; label: string; href: string }> = [
  { key: "h", label: "Today", href: "/" },
  { key: "t", label: "Timetable", href: "/timetable" },
  { key: "c", label: "Courses", href: "/courses" },
  { key: "p", label: "Progress", href: "/progress" },
  { key: "k", label: "Calendar", href: "/calendar" },
  { key: "n", label: "Notifications", href: "/notifications" },
  { key: "r", label: "Professors", href: "/professors" },
  { key: "u", label: "Curriculum", href: "/programs" },
];

/** True while the user types in a field: shortcuts never fire then. */
export const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  if (!t || !t.tagName) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
};
