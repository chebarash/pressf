"use client";

import { CommandPalette } from "./CommandPalette";
import { DesktopKeyboard } from "./Keyboard";
import { ShortcutsSheet } from "./ShortcutsSheet";

export { GO_TO, openPalette, openShortcuts, toggleTheme } from "./bus";

/**
 * Mount once in the desktop shell (beside the sidebar, inside the app layout):
 * keyboard (G-chords, J/K, page keys), the ⌘K / F command palette and the ? sheet.
 * The sidebar's Search and Shortcuts buttons call `openPalette()` / `openShortcuts()`.
 */
export function DesktopGlobal() {
  return (
    <>
      <DesktopKeyboard />
      <CommandPalette />
      <ShortcutsSheet />
    </>
  );
}
