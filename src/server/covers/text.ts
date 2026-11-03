import { fontkitFont, type FontKey } from "./assets";

/**
 * Text measuring with the same fonts the PDF embeds, so wrapped lines and
 * positions match between the PDF cover and its PNG preview. Characters the
 * serif lacks (Cyrillic, arrows) fall back to Geologica Medium, as the browser
 * would; characters no font has are dropped instead of drawing boxes.
 */

const FALLBACK: Record<FontKey, FontKey[]> = {
  serif: ["serif", "medium"],
  regular: ["regular"],
  medium: ["medium"],
  semibold: ["semibold"],
};

// Glyphs the design uses that the fonts lack, mapped to the closest one they have.
const SUBSTITUTE: Record<string, string> = { "⋯": "…", "ʻ": "’", "ʼ": "’" };

export type Run = { text: string; font: FontKey };

/** Splits text into runs of one font each. */
export function runs(text: string, font: FontKey): Run[] {
  const out: Run[] = [];
  for (const raw of text) {
    const ch = SUBSTITUTE[raw] ?? raw;
    const cp = ch.codePointAt(0)!;
    const f = ch === "\n" ? font : FALLBACK[font].find((k) => fontkitFont(k).hasGlyphForCodePoint(cp));
    if (!f) continue;
    const last = out[out.length - 1];
    if (last && last.font === f) last.text += ch;
    else out.push({ text: ch, font: f });
  }
  return out;
}

export const clean = (text: string, font: FontKey) => runs(text, font).map((r) => r.text).join("");

/** Width in points of `text` at `size`. */
export function measure(text: string, font: FontKey, size: number) {
  let w = 0;
  for (const r of runs(text, font)) {
    const f = fontkitFont(r.font);
    let units = 0;
    for (const ch of r.text) units += f.glyphForCodePoint(ch.codePointAt(0)!).advanceWidth;
    w += (units / f.unitsPerEm) * size;
  }
  return w;
}

/** CSS "normal" line height (what Figma calls auto). */
export function normalLineHeight(font: FontKey, size: number) {
  const f = fontkitFont(font);
  return ((f.ascent - f.descent + f.lineGap) / f.unitsPerEm) * size;
}

/** Baseline of a line box that starts at `top` (CSS half-leading model). */
export function baseline(top: number, lineHeight: number, font: FontKey, size: number) {
  const f = fontkitFont(font);
  const content = ((f.ascent - f.descent) / f.unitsPerEm) * size;
  return top + (lineHeight - content) / 2 + (f.ascent / f.unitsPerEm) * size;
}

/** Greedy word wrap; explicit newlines are kept. Words longer than a line are split by character. */
export function wrap(text: string, font: FontKey, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next, font, size) <= maxWidth) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      if (measure(word, font, size) <= maxWidth) {
        line = word;
        continue;
      }
      for (const ch of word) {
        if (measure(line + ch, font, size) > maxWidth && line) {
          lines.push(line);
          line = "";
        }
        line += ch;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Title lines as the design sets them: when a title needs two lines and has a
 * comma ("Midterm exam, Fall 2025"), break after the comma if both halves fit.
 */
export function titleLines(text: string, font: FontKey, size: number, maxWidth: number): string[] {
  const lines = wrap(text, font, size, maxWidth);
  if (lines.length !== 2 || text.includes("\n")) return lines;
  const i = text.lastIndexOf(", ");
  if (i < 0) return lines;
  const parts = [text.slice(0, i + 1), text.slice(i + 2)];
  return parts.every((p) => measure(p, font, size) <= maxWidth) ? parts : lines;
}

/** Ellipsizes a single line to fit. */
export function ellipsize(text: string, font: FontKey, size: number, maxWidth: number) {
  if (measure(text, font, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && measure(`${t.trimEnd()}…`, font, size) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
