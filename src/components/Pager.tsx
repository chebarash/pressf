import Link from "next/link";
import { Arrow } from "./ui";

const Back = () => <span style={{ display: "inline-flex", transform: "scaleX(-1)" }}><Arrow /></span>;

/** The pages worth showing: both ends and the neighbours of the current one. */
export function pageList(page: number, pages: number) {
  const shown = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  return shown.flatMap((n, index) => (index > 0 && n - shown[index - 1] > 2 ? ["gap", n] : index > 0 && n - shown[index - 1] === 2 ? [n - 1, n] : [n])) as Array<number | "gap">;
}

export function Pager({ page, pages, query }: { page: number; pages: number; query: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (n: number) => `?${new URLSearchParams(Object.entries({ ...query, page: String(n) }).filter((e): e is [string, string] => !!e[1]))}`;
  return (
    <nav className="pager" aria-label="Pages">
      {page > 1 ? <Link className="key cap sm" href={href(page - 1)} aria-label="Previous page"><Back /></Link> : <span className="key cap sm off" aria-hidden="true"><Back /></span>}
      <span className="pager-count small soft">Page {page} of {pages}</span>
      <span className="pager-pages">
        {pageList(page, pages).map((n, index) => (n === "gap" ? <span key={`gap${index}`} className="small soft pager-gap">…</span> : <Link key={n} className={`key cap sm ${n === page ? "on" : ""}`} href={href(n)} aria-current={n === page ? "page" : undefined}>{n}</Link>))}
      </span>
      {page < pages ? <Link className="key cap sm" href={href(page + 1)} aria-label="Next page"><Arrow /></Link> : <span className="key cap sm off" aria-hidden="true"><Arrow /></span>}
    </nav>
  );
}

export const PER_PAGE = 30;
