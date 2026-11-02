/** Escapes text for Telegram's HTML parse mode. */
export const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A bot message as drawn in the design: a bold first line, then plain lines. */
export const card = (title: string, ...lines: Array<string | null | undefined | false>) =>
  [`<b>${esc(title)}</b>`, ...lines.filter((line): line is string => typeof line === "string" && line.length > 0).map(esc)].join("\n");
