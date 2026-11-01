"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Arrow, Face, Icons, Score } from "./ui";

type Result = { kind: string; id: string; title: string; subtitle: string; href: string; score?: number | null; face?: string | null };

const SECTIONS: Array<[string, string]> = [["Course", "Courses"], ["Professor", "People"], ["File", "Files"]];

export function Palette({ variant }: { variant?: "bar" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const [down, setDown] = useState(false);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // The page can hold a second search bar; only the header one owns the F key.
    if (variant === "bar") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "f" || event.key.toLowerCase() === "а") {
        event.preventDefault();
        const pageSearch = document.querySelector<HTMLInputElement>("[data-page-search]");
        if (pageSearch) { pageSearch.focus(); pageSearch.select(); return; }
        setDown(true);
        setTimeout(() => { setDown(false); setOpen(true); }, 80);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        setResults((await response.json()).results);
        setActive(0);
      } catch { /* a newer query replaced this one */ }
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query]);

  const go = useCallback((result: Result) => {
    navigator.sendBeacon?.("/api/search", JSON.stringify({ kind: result.kind, id: result.id }));
    setOpen(false);
    setQuery("");
    router.push(result.href);
  }, [router]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") setOpen(false);
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (event.key === "Enter" && results[active]) go(results[active]);
  };

  return (
    <>
      {variant === "bar" ? (
        <button className="search" onClick={() => setOpen(true)}>
          {Icons.search(24)}
          <span className="grow search-hint">Find a course, professor or file</span>
          <span className="small soft hide-sm">press</span>
          <span className="key cap sm" aria-hidden="true" style={{ marginBottom: 0 }}>F</span>
        </button>
      ) : (
        <span className="row nav-search"><span className="small soft hide-sm">Search</span><button className={`key cap sm ${down ? "down" : ""}`} onClick={() => setOpen(true)} aria-label="Search">F</button></span>
      )}
      {open && (
        <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="panel palette" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown}>
            <div className="search focused" style={{ cursor: "text" }}>
              {Icons.search(24)}
              <input ref={input} id="palette-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a course, professor or file" aria-label="Search" autoComplete="off" />
              <span className="small soft hide-sm">press</span>
              <span className="key cap sm hide-sm" aria-hidden="true" style={{ marginBottom: 0 }}>F</span>
            </div>
            {SECTIONS.map(([kind, title]) => {
              const items = results.filter((result) => result.kind === kind);
              return items.length > 0 && (
                <div key={kind} className="palette-group">
                  <span className="caps soft">{title}</span>
                  {items.map((result) => {
                    const index = results.indexOf(result);
                    return (
                      <button key={result.href} className={`result ${index === active ? "on" : ""}`} onClick={() => go(result)} onMouseEnter={() => setActive(index)}>
                        {kind === "Course" ? <Score value={result.score} /> : kind === "Professor" ? <Face name="" src={result.face} size={48} /> : <span className="result-file">{Icons.file(20)}</span>}
                        <span className="grow"><span className="t" style={{ display: "block" }}>{result.title}</span><span className="small soft">{result.subtitle}</span></span>
                        {index === active && <Arrow />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {!results.length && query && <p className="soft" style={{ padding: 12 }}>Nothing found. Try a course code like MATH111 or a last name.</p>}
            <div className="palette-hints small soft hide-sm"><span>↑↓ move</span><span>↵ open</span><span>esc close</span></div>
          </div>
        </div>
      )}
    </>
  );
}
