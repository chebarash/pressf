import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { compareValues, nextSort, parseSort, sortRows, withSort, type Sort, type SortValue } from "@/core/sort";
import { AUDIT_SORTS, COURSE_SORTS, PEOPLE_SORTS, UPLOAD_SORTS } from "@/server/admin/sorts";
import { SortableRows } from "@/ui/table/Sort";

const order = (values: SortValue[], dir: "asc" | "desc") => [...values].sort((a, b) => compareValues(a, b, dir));

describe("column sort comparator", () => {
  it("compares numbers as numbers, not text", () => {
    expect(order([10, 9, 100, 2.5], "asc")).toEqual([2.5, 9, 10, 100]);
    expect(order([10, 9, 100, 2.5], "desc")).toEqual([100, 10, 9, 2.5]);
  });

  it("puts missing values last in both directions", () => {
    expect(order([3, null, 1, undefined, Number.NaN, 2], "asc").slice(0, 3)).toEqual([1, 2, 3]);
    expect(order([3, null, 1, undefined, 2], "desc").slice(0, 3)).toEqual([3, 2, 1]);
    expect(order(["b", "—", "", "a"], "asc").slice(0, 2)).toEqual(["a", "b"]);
    expect(order(["b", "—", "a"], "desc")).toEqual(["b", "a", "—"]);
  });

  it("orders dates by time", () => {
    const a = new Date("2026-11-03T10:00:00Z");
    const b = new Date("2026-01-15T10:00:00Z");
    const c = new Date("2026-11-03T09:59:00Z");
    expect(order([a, b, c], "asc")).toEqual([b, c, a]);
    expect(order([a, b, null, c], "desc")).toEqual([a, c, b, null]);
  });

  it("orders text with numbers inside as numbers, ignoring case and accents", () => {
    expect(order(["Week 10", "Week 9", "Week 1"], "asc")).toEqual(["Week 1", "Week 9", "Week 10"]);
    expect(compareValues("Émile", "emile")).toBe(0);
    expect(order(["Zafar", "Ábror", "aziz"], "asc")).toEqual(["Ábror", "aziz", "Zafar"]);
  });

  it("is stable and keeps the table's order without a sort", () => {
    const rows = [{ n: "b", v: 1 }, { n: "a", v: 2 }, { n: "c", v: 1 }];
    const cols = { v: (r: (typeof rows)[number]) => r.v, n: (r: (typeof rows)[number]) => r.n };
    expect(sortRows(rows, null, cols).map((r) => r.n)).toEqual(["b", "a", "c"]);
    expect(sortRows(rows, { key: "v", dir: "asc" }, cols).map((r) => r.n)).toEqual(["b", "c", "a"]);
    expect(sortRows(rows, { key: "v", dir: "desc" }, cols).map((r) => r.n)).toEqual(["a", "b", "c"]);
  });

  it("cycles ascending → descending → default on the same column; another column starts ascending", () => {
    const a = nextSort<string>(null, "name");
    expect(a).toEqual({ key: "name", dir: "asc" });
    const d = nextSort(a, "name");
    expect(d).toEqual({ key: "name", dir: "desc" });
    expect(nextSort(d, "name")).toBeNull();
    expect(nextSort(d, "age")).toEqual({ key: "age", dir: "asc" });
  });
});

describe("server sort URL params", () => {
  it("accepts only whitelisted columns", () => {
    expect(parseSort({ sort: "when", dir: "desc" }, AUDIT_SORTS)).toEqual({ key: "when", dir: "desc" });
    expect(parseSort(new URLSearchParams("sort=who&dir=asc"), AUDIT_SORTS)).toEqual({ key: "who", dir: "asc" });
    expect(parseSort({ sort: "what" }, AUDIT_SORTS)).toBeNull();
    expect(parseSort({ sort: "at; drop table users" }, AUDIT_SORTS)).toBeNull();
    expect(parseSort({ sort: "constructor" }, PEOPLE_SORTS)).toBeNull();
    expect(parseSort({}, COURSE_SORTS)).toBeNull();
    expect(parseSort({ sort: "shares", dir: "sideways" }, COURSE_SORTS)).toEqual({ key: "shares", dir: "asc" });
    expect(parseSort({ sort: ["age", "title"], dir: ["desc"] }, UPLOAD_SORTS)).toEqual({ key: "age", dir: "desc" });
    expect(parseSort({ sort: "student" }, UPLOAD_SORTS)).toBeNull();
  });

  it("writes the sort into the query and keeps the other params", () => {
    expect(withSort("?tab=live&id=7", { key: "age", dir: "desc" })).toBe("?tab=live&id=7&sort=age&dir=desc");
    expect(withSort("?q=x&sort=age&dir=desc", null)).toBe("?q=x");
    expect(withSort("", null)).toBe("");
  });
});

describe("a sortable table", () => {
  type K = "name" | "score";
  const rows = [
    { id: "a", name: "Week 10", score: 70 },
    { id: "b", name: "Week 9", score: null },
    { id: "c", name: "week 2", score: 91 },
  ];
  const render = (initial: Sort<K>) =>
    renderToStaticMarkup(
      createElement(SortableRows<K>, {
        initial,
        columns: [
          { key: "name", label: "Name" },
          { key: "score", label: "Score" },
        ],
        rows: rows.map((r) => ({ id: r.id, values: { name: r.name, score: r.score }, node: createElement("p", { "data-row": r.id }, r.name) })),
      }),
    );
  const ids = (html: string) => [...html.matchAll(/data-row="(\w)"/g)].map((m) => m[1]);
  const aria = (html: string) => [...html.matchAll(/aria-sort="(\w+)"/g)].map((m) => m[1]);

  it("toggles ascending, descending, then back to the default order", () => {
    let sort: Sort<K> = null;
    let html = render(sort);
    expect(ids(html)).toEqual(["a", "b", "c"]);
    expect(aria(html)).toEqual(["none", "none"]);
    expect(html).toContain('<button type="button"');

    sort = nextSort(sort, "score");
    html = render(sort);
    expect(ids(html)).toEqual(["a", "c", "b"]);
    expect(aria(html)).toEqual(["none", "ascending"]);

    sort = nextSort(sort, "score");
    html = render(sort);
    expect(ids(html)).toEqual(["c", "a", "b"]);
    expect(aria(html)).toEqual(["none", "descending"]);

    sort = nextSort(sort, "score");
    html = render(sort);
    expect(ids(html)).toEqual(["a", "b", "c"]);
    expect(aria(html)).toEqual(["none", "none"]);

    expect(ids(render(nextSort(null, "name")))).toEqual(["c", "b", "a"]);
  });
});
