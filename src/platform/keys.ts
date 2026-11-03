/**
 * Layout-independent key names for shortcuts. `e.key` follows the active
 * keyboard layout (G on a Russian layout arrives as "п"), so letters, digits
 * and the slash/question key are read from the physical key (`e.code`).
 */
export function keyName(e: Pick<KeyboardEvent, "key" | "code" | "shiftKey">): string {
  const letter = /^Key([A-Z])$/.exec(e.code)?.[1];
  if (letter) return letter.toLowerCase();
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1];
  if (digit) return digit;
  if (e.code === "Slash") return e.shiftKey ? "?" : "/";
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

/** True when the physical key is a letter (for "shift+r" style names). */
export const isLetterKey = (e: Pick<KeyboardEvent, "code">) => /^Key[A-Z]$/.test(e.code);

/** "⌘" on Apple keyboards, "Ctrl" elsewhere, for the ⌘K / Ctrl+K hints. Client only. */
export const modLabel = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
