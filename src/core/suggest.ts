/** "Did you mean …?" for a search that found nothing (Figma D17). */

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Edit distance (insert, delete, substitute), stopping early once it passes `max`. */
export function distance(a: string, b: string, max = Infinity): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * The name closest to a mistyped query: at most one edit per four letters
 * (at least one), never the query itself. Null when nothing is close enough.
 */
export function closest(query: string, names: string[]): string | null {
  const q = norm(query);
  if (q.length < 3) return null;
  const max = Math.max(1, Math.floor(q.length / 4));
  let hit: { name: string; d: number } | null = null;
  for (const name of names) {
    const n = norm(name);
    if (n === q) continue;
    // Whole name, or its start when the query is shorter ("calculas" ~ "Calculus 1").
    const d = Math.min(distance(q, n, max), n.length > q.length ? distance(q, n.slice(0, q.length), max) : max + 1);
    if (d <= max && (!hit || d < hit.d || (d === hit.d && name.localeCompare(hit.name) < 0))) hit = { name, d };
  }
  return hit?.name ?? null;
}
