"use client";

import type { CSSProperties, ReactNode } from "react";
import { Fragment, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ariaSort, nextSort, sortRows, withSort, type Sort, type SortColumns, type SortValue } from "@/core/sort";
import { ChevronDownIcon } from "@/ui/icons";
import t from "./sort.module.css";

/** A table's sort and how a header click changes it. */
export type SortState<K extends string> = { sort: Sort<K>; toggle: (key: K) => void };

/** Client-side sort for tables whose rows are all on the page. Returns the rows in order too. */
export function useSortedRows<T, K extends string>(rows: readonly T[], columns: SortColumns<T, K>, initial: Sort<K> = null) {
  const [sort, setSort] = useState<Sort<K>>(initial);
  const state: SortState<K> = { sort, toggle: (key) => setSort((s) => nextSort(s, key)) };
  return { rows: sortRows(rows, sort, columns), state };
}

/**
 * Server-side sort: the choice lives in the URL (`?sort=<col>&dir=asc|desc`) and the
 * page re-renders with rows ordered by the database, so limits and paging stay right.
 * The arrow moves at once; the rows follow when the server answers.
 */
export function useUrlSort<K extends string>(sort: Sort<K>): SortState<K> & { pending: boolean } {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(sort);
  const toggle = (key: K) =>
    start(() => {
      const next = nextSort(shown, key);
      setShown(next);
      router.replace(`${window.location.pathname}${withSort(window.location.search, next)}`, { scroll: false });
    });
  return { sort: shown, toggle, pending };
}

export type SortableRow<K extends string> = { id: string; values: Record<K, SortValue>; node: ReactNode };
export type SortableColumn<K extends string> = { key: K | null; label: ReactNode; className?: string; style?: CSSProperties };

/**
 * A header row and rows, sorted on the client. For server components: rows arrive
 * already rendered, with the values they sort by. `key: null` is a column that doesn't sort.
 */
export function SortableRows<K extends string>({ columns, rows, headClassName, sortable = true, initial = null }: { columns: SortableColumn<K>[]; rows: SortableRow<K>[]; headClassName?: string; sortable?: boolean; initial?: Sort<K> }) {
  const [sort, setSort] = useState<Sort<K>>(initial);
  const state: SortState<K> = { sort, toggle: (key) => setSort((s) => nextSort(s, key)) };
  const shown = sortRows(rows, sort, Object.fromEntries(columns.filter((c) => c.key).map((c) => [c.key, (r: SortableRow<K>) => r.values[c.key as K]])) as SortColumns<SortableRow<K>, K>);
  return (
    <>
      <div className={headClassName} role="row">
        {columns.map((c, i) =>
          c.key ? (
            <SortHeader key={c.key} state={sortable ? state : undefined} k={c.key} className={c.className} style={c.style}>
              {c.label}
            </SortHeader>
          ) : (
            <span key={`_${i}`} className={c.className} style={c.style}>
              {c.label}
            </span>
          ),
        )}
      </div>
      {shown.map((r) => (
        <Fragment key={r.id}>{r.node}</Fragment>
      ))}
    </>
  );
}

/** A header row for a server-sorted table (the rows are rendered by the server in URL order). */
export function UrlSortHead<K extends string>({ sort, columns, className }: { sort: Sort<K>; columns: SortableColumn<K>[]; className?: string }) {
  const state = useUrlSort(sort);
  return (
    <div className={className} role="row" aria-busy={state.pending || undefined}>
      {columns.map((c, i) =>
        c.key ? (
          <SortHeader key={c.key} state={state} k={c.key} className={c.className} style={c.style}>
            {c.label}
          </SortHeader>
        ) : (
          <span key={`_${i}`} className={c.className} style={c.style}>
            {c.label}
          </span>
        ),
      )}
    </div>
  );
}

type HeaderProps<K extends string> = {
  /** Without a state the header is plain text (e.g. a table with one row). */
  state?: SortState<K>;
  k: K;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/** A column header that sorts: click (or Enter/Space) for ascending, again for descending, a third time for the default order. */
export function SortHeader<K extends string>({ state, k, className, style, children }: HeaderProps<K>) {
  if (!state) return <span className={className} style={style}>{children}</span>;
  const aria = ariaSort(state.sort, k);
  const on = aria !== "none";
  // Not active: the hover arrow previews "ascending".
  const up = aria !== "descending";
  return (
    <span className={className} style={style} role="columnheader" aria-sort={aria}>
      <button type="button" className={`${t.btn}${on ? ` ${t.on}` : ""}`} onClick={() => state.toggle(k)}>
        <span className={t.label}>{children}</span>
        <ChevronDownIcon size={12} className={`${t.arrow}${up ? ` ${t.up}` : ""}`} />
      </button>
    </span>
  );
}
