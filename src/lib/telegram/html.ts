/** Escapes text for Telegram's HTML parse mode. */
export const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A bot message as drawn in the design: a bold first line, then plain lines. */
export const card = (title: string, ...lines: Array<string | null | undefined | false>) =>
  [`<b>${esc(title)}</b>`, ...lines.filter((line): line is string => typeof line === "string" && line.length > 0).map(esc)].join("\n");

/**
 * A time Telegram renders in the reader's clock and keeps current (Bot API
 * 9.5): `r` relative ("in 3 hours"), `t` the time, `wDT` weekday, date and
 * time. `fallback` is what older apps show.
 */
export const tgTime = (at: Date, format: "r" | "t" | "wDT", fallback: string) =>
  `<tg-time unix="${Math.floor(at.getTime() / 1000)}" format="${format}">${esc(fallback)}</tg-time>`;
