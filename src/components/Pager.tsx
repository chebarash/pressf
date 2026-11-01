import Link from "next/link";

export function Pager({ page, pages, query }: { page: number; pages: number; query: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (n: number) => `?${new URLSearchParams(Object.entries({ ...query, page: String(n) }).filter((e): e is [string, string] => !!e[1]))}`;
  return (
    <nav className="row between" aria-label="Pages">
      {page > 1 ? <Link className="key btn sm" href={href(page - 1)}>Previous</Link> : <span />}
      <span className="small soft">Page {page} of {pages}</span>
      {page < pages ? <Link className="key btn sm" href={href(page + 1)}>Next</Link> : <span />}
    </nav>
  );
}

export const PER_PAGE = 30;
