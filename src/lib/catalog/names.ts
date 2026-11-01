import type { Teacher } from "./types";

const letters = (word: string) =>
  word.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}]/gu, "");

function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

/**
 * Keeps a given name and a surname. Sources give the parts in any order, so the
 * surname comes from the email id: `a-herrmann` turns "Anton Wolfgang Herrmann"
 * into "Anton Herrmann". Without such an id the first two words stay.
 */
export function shortName({ id, display_name: name }: Pick<Teacher, "id" | "display_name">) {
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return name.trim();
  const parts = id.match(/^([a-z]+)-([a-z]+)$/);
  if (!parts) return words.slice(0, 2).join(" ");
  const [, initials, surname] = parts;
  const closest = words
    .map((word, index) => ({ index, cost: distance(letters(word), surname) }))
    .sort((a, b) => a.cost - b.cost || a.index - b.index)[0].index;
  const others = words.map((_, index) => index).filter((index) => index !== closest);
  const given = others.find((index) => letters(words[index]).startsWith(initials[0])) ?? others[0];
  return [closest, given].sort((a, b) => a - b).map((index) => words[index]).join(" ");
}
