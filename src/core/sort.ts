/**
 * Column sorting for tables: one comparator for every table, the click cycle
 * (ascending → descending → the table's own order) and the URL whitelist for
 * tables sorted on the server (`?sort=<col>&dir=asc|desc`).
 */

export type SortDir = "asc" | "desc";
export type Sort<K extends string = string> = { key: K; dir: SortDir } | null;
/** What a column sorts by: the underlying value, never the formatted text. */
export type SortValue = number | string | Date | boolean | null | undefined;

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** "—", "", NaN, null and undefined are "no value": they go last in both directions. */
const missing = (v: SortValue) =>
  v == null || (typeof v === "number" && Number.isNaN(v)) || (v instanceof Date && Number.isNaN(v.getTime())) || (typeof v === "string" && (v.trim() === "" || v.trim() === "—"));

const asNumber = (v: Exclude<SortValue, null | undefined | string>) => (v instanceof Date ? v.getTime() : typeof v === "boolean" ? Number(v) : v);

/**
 * Compare two cell values for `dir`. Numbers, dates and booleans compare as
 * numbers; text compares accent- and case-insensitively with numbers inside it
 * read as numbers ("Week 9" before "Week 10"). Missing values sort last either way.
 */
export function compareValues(a: SortValue, b: SortValue, dir: SortDir = "asc"): number {
  const ma = missing(a);
  const mb = missing(b);
  if (ma || mb) return ma === mb ? 0 : ma ? 1 : -1;
  const sign = dir === "asc" ? 1 : -1;
  if (typeof a === "string" || typeof b === "string") return sign * collator.compare(String(a), String(b));
  const d = asNumber(a as number) - asNumber(b as number);
  return sign * (d < 0 ? -1 : d > 0 ? 1 : 0);
}

export type SortColumns<T, K extends string> = Record<K, (row: T) => SortValue>;

/** Rows in `sort` order (stable: ties keep the table's own order). No sort: the rows as given. */
export function sortRows<T, K extends string>(rows: readonly T[], sort: Sort<K>, columns: SortColumns<T, K>): T[] {
  const get = sort ? columns[sort.key] : undefined;
  if (!sort || !get) return [...rows];
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((a, b) => compareValues(a.v, b.v, sort.dir) || a.i - b.i)
    .map((x) => x.row);
}

/** One click on a column header: ascending, then descending, then back to the default order. */
export function nextSort<K extends string>(current: Sort<K>, key: K): Sort<K> {
  if (!current || current.key !== key) return { key, dir: "asc" };
  return current.dir === "asc" ? { key, dir: "desc" } : null;
}

/** aria-sort for a header cell. */
export const ariaSort = (sort: Sort, key: string): "ascending" | "descending" | "none" =>
  sort?.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none";

type Params = URLSearchParams | Record<string, string | string[] | undefined>;
const param = (p: Params, k: string) => {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  return Array.isArray(v) ? v[0] : v ?? undefined;
};

/**
 * `?sort=<col>&dir=asc|desc` from the URL, only for whitelisted columns; anything
 * else means "no sort" (the table's default order). `dir` defaults to ascending.
 */
export function parseSort<K extends string>(params: Params, allowed: readonly K[]): Sort<K> {
  const key = param(params, "sort");
  if (!key || !(allowed as readonly string[]).includes(key)) return null;
  const dir = param(params, "dir");
  return { key: key as K, dir: dir === "desc" ? "desc" : "asc" };
}

/** The URL query with `sort` applied (other params kept; no sort removes both). */
export function withSort(search: string | URLSearchParams, sort: Sort): string {
  const q = new URLSearchParams(search);
  q.delete("sort");
  q.delete("dir");
  if (sort) {
    q.set("sort", sort.key);
    q.set("dir", sort.dir);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Query entries for links that must keep the current sort. */
export const sortEntries = (sort: Sort): Record<string, string> => (sort ? { sort: sort.key, dir: sort.dir } : {});
