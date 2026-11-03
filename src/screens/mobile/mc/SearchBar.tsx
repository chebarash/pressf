"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "./kit";
import s from "./mc.module.css";
import c from "./screens.module.css";

/**
 * Figma SearchBar (7.1–7.3). Typing asks the server for results (`onQuery`) and
 * only rewrites ?q= in place, so the field is never re-mounted and keeps focus.
 */
export function SearchBar({ query, first, onQuery }: { query: string; first: string | null; onQuery: (q: string) => void }) {
  const router = useRouter();
  const path = usePathname();
  const [value, setValue] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Arriving from the top bar the keyboard is already up (focus was taken during the tap): keep it here.
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const change = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const q = next.trim();
      window.history.replaceState(window.history.state, "", q ? `${path}?q=${encodeURIComponent(q)}` : path);
      onQuery(q);
    }, 140);
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
        ref={input}
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
