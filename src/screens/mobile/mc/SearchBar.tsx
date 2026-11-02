"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SearchIcon } from "./kit";
import s from "./mc.module.css";
import c from "./screens.module.css";

/** Figma SearchBar (7.1–7.3): typing updates ?q= and the server renders the results. */
export function SearchBar({ query, first }: { query: string; first: string | null }) {
  const router = useRouter();
  const path = usePathname();
  const [value, setValue] = useState(query);
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const change = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const q = next.trim();
      start(() => router.replace(q ? `${path}?q=${encodeURIComponent(q)}` : path, { scroll: false }));
    }, 180);
  };

  return (
    <form
      role="search"
      className={c.searchBar}
      onSubmit={(e) => {
        e.preventDefault();
        if (first) router.push(first);
      }}
    >
      <SearchIcon size={24} aria-hidden />
      <label htmlFor="pf-search" className={s.sr}>
        Search
      </label>
      <input
        id="pf-search"
        className={c.searchInput}
        type="search"
        enterKeyHint="go"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        placeholder="Course, professor, file"
        value={value}
        onChange={(e) => change(e.target.value)}
      />
    </form>
  );
}
