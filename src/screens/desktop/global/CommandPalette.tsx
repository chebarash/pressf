"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../parts/Icon";
import s from "../parts/parts.module.css";
import { GO_TO, openShortcuts, PALETTE_EVENT, toggleTheme } from "./bus";
import { paletteSearch, type PaletteHit } from "./actions";
import o from "./overlay.module.css";
import { modLabel } from "@/platform/keys";

type Item = { id: string; group: "Courses" | "Actions" | "People" | "Files"; icon: IconName; title: string; meta?: string; keys?: string[]; href?: string; run?: () => void };

const ICONS: Record<string, IconName> = { Today: "pin", Timetable: "clock", Courses: "book", Progress: "check", Calendar: "calendar", Notifications: "mail", Professors: "users", Curriculum: "file" };

const ACTIONS: Item[] = [
  ...GO_TO.map((g) => ({ id: `go-${g.key}`, group: "Actions" as const, icon: ICONS[g.label] ?? "chevron-right", title: `Go to ${g.label}`, keys: ["F", g.key.toUpperCase()], href: g.href })),
  { id: "search", group: "Actions", icon: "search", title: "Search everything", href: "/search" },
  { id: "rate", group: "Actions", icon: "check", title: "Rate last semester", href: "/rate" },
  { id: "next", group: "Actions", icon: "calendar", title: "Next semester", href: "/next" },
  { id: "settings", group: "Actions", icon: "users", title: "Settings", href: "/me" },
  { id: "theme", group: "Actions", icon: "moon", title: "Dark theme", keys: ["⇧", "D"], run: toggleTheme },
  { id: "shortcuts", group: "Actions", icon: "file", title: "All shortcuts", keys: ["?"], run: openShortcuts },
];

const ORDER: Item["group"][] = ["Courses", "Actions", "People", "Files"];

const GROUP = { course: "Courses", person: "People", file: "Files" } as const;
const fromSearch = (hits: PaletteHit[]): Item[] =>
  hits.map((h) => ({ id: `${h.kind}-${h.id}`, group: GROUP[h.kind], icon: h.kind === "course" ? "book" : h.kind === "person" ? "users" : "file", title: h.title, meta: h.meta || undefined, href: h.href }));

/** D2 Command palette: ⌘K / Ctrl+K anywhere on desktop (the one search shortcut). Courses, actions, people and files in one list. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Item[]>([]);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setQ((e as CustomEvent<{ query?: string }>).detail?.query ?? "");
      setCursor(0);
      setOpen(true);
    };
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(PALETTE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // Search as you type, debounced; the palette never blocks on it.
  useEffect(() => {
    if (!open) return;
    const query = q.trim();
    if (!query) return;
    let live = true;
    const timer = window.setTimeout(() => {
      paletteSearch(query)
        .then((hits) => live && setHits(fromSearch(hits)))
        .catch(() => {});
    }, 120);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [q, open]);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const actions = needle ? ACTIONS.filter((a) => a.id !== "search" && a.title.toLowerCase().includes(needle)) : ACTIONS.slice(0, 6);
    const searchAll: Item[] = needle ? [{ id: "search-q", group: "Actions", icon: "search", title: `Search for “${q.trim()}”`, href: `/search?q=${encodeURIComponent(q.trim())}` }] : [];
    // The best course match also gets its files as an action (Figma D2: "Calculus 1 · all files").
    const top = needle ? hits.find((h) => h.group === "Courses") : undefined;
    const files: Item[] = top?.href ? [{ id: `files-${top.id}`, group: "Actions", icon: "file", title: `${top.title} · all files`, href: `${top.href}/files` }] : [];
    const all = [...(needle ? hits : []), ...actions, ...files, ...searchAll];
    return ORDER.flatMap((g) => all.filter((i) => i.group === g));
  }, [hits, q]);

  const close = () => setOpen(false);
  const run = (item: Item | undefined, newTab = false) => {
    if (!item) return;
    close();
    if (item.run) item.run();
    else if (item.href) {
      if (newTab) window.open(item.href, "_blank", "noopener");
      else router.push(item.href);
    }
  };

  useEffect(() => {
    list.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(items.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(items[cursor], e.metaKey || e.ctrlKey);
    }
  };

  return (
    <div className={o.scrim} onMouseDown={(e) => e.target === e.currentTarget && close()} data-keyboard-scope>
      <div className={o.palette} role="dialog" aria-modal="true" aria-label="Search and commands" onKeyDown={onKeyDown}>
        <label className={o.input}>
          <Icon name="search" size={20} />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            placeholder="Search courses, people, files or type a command"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={items[cursor] ? `palette-${items[cursor].id}` : undefined}
          />
          <button type="button" className={o.escBtn} onClick={close} aria-label="Close">
            <kbd className={s.key}>Esc</kbd>
          </button>
        </label>
        <div className={o.results} ref={list} id="palette-results" role="listbox">
          {items.length === 0 && <p className={o.none}>Nothing for “{q}”. Try a course code like MATH111.</p>}
          {ORDER.map((g) => {
            const groupItems = items.filter((i) => i.group === g);
            if (!groupItems.length) return null;
            return (
              <div key={g} className={o.group} role="group" aria-label={g}>
                <p className={o.groupLabel}>{g === "People" ? "People" : g}</p>
                {groupItems.map((item) => {
                  const i = items.indexOf(item);
                  const on = i === cursor;
                  return (
                    <div
                      key={item.id}
                      id={`palette-${item.id}`}
                      data-index={i}
                      role="option"
                      aria-selected={on}
                      className={`${o.item} ${on ? o.itemOn : ""}`}
                      onMouseMove={() => cursor !== i && setCursor(i)}
                      onClick={(e) => run(item, e.metaKey || e.ctrlKey)}
                    >
                      <Icon name={item.icon} size={18} />
                      <span className={o.itemText}>
                        <span className={o.itemTitle}>{item.title}</span>
                        {item.meta && <span className={o.itemMeta}>{item.meta}</span>}
                      </span>
                      {on && !item.keys ? (
                        <kbd className={s.key}>↵</kbd>
                      ) : (
                        item.keys && (
                          <span className={s.keys}>
                            {item.keys.map((k) => (
                              <kbd key={k} className={s.key}>
                                {k}
                              </kbd>
                            ))}
                          </span>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className={o.footer}>
          <span>
            <kbd className={s.key}>↑↓</kbd>move
          </span>
          <span>
            <kbd className={s.key}>↵</kbd>open
          </span>
          <span>
            <kbd className={s.key}>{modLabel()}↵</kbd>open in new tab
          </span>
        </div>
      </div>
    </div>
  );
}
