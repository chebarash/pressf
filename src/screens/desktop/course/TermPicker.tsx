"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../parts/Icon";
import c from "./course.module.css";

export type TermOption = { label: string; href: string; selected?: boolean };

/**
 * D4 semester picker: the "Fall 2026 · Now" pill opens a menu of the semesters
 * the course ran. Click or Enter/Space/↓ opens it; ↑↓ move, Enter picks, Esc or
 * a click outside closes; picking a semester closes it and loads that semester.
 * The other semesters are prefetched in full once the page is idle, so a pick
 * swaps the content in place instead of showing the loading skeleton.
 */
export function TermPicker({ label, options }: { label: string; options: TermOption[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setWarm(true), 800);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    // Focus the chosen semester (or the first) once the menu is up.
    const items = root.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]");
    const chosen = [...(items ?? [])].find((i) => i.getAttribute("aria-checked") === "true") ?? items?.[0];
    chosen?.focus();
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(root.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && open) {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
      items[next]?.focus();
    } else if ((e.key === "Home" || e.key === "End") && open) {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (e.key === "ArrowDown" && !open && document.activeElement === button.current) {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "Tab" && open) {
      setOpen(false);
    }
  };

  // One semester: nothing to pick, the pill just names it.
  if (options.length < 2) {
    return (
      <span className={c.termPill}>
        <Icon name="calendar" size={16} />
        {label}
      </span>
    );
  }

  return (
    <div ref={root} className={c.termSwitch} onKeyDown={onKey} onPointerEnter={() => setWarm(true)}>
      {warm && !open && (
        // Full prefetch of each semester (Link prefetch={true}); invisible, not focusable, not announced.
        <div aria-hidden style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}>
          {options.filter((o) => !o.selected).map((o) => (
            <Link key={o.href} href={o.href} prefetch tabIndex={-1} scroll={false}>{o.label}</Link>
          ))}
        </div>
      )}
      <button ref={button} type="button" className={c.termPill} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((o) => !o)}>
        <Icon name="calendar" size={16} />
        {label}
        <Icon name="chevron-down" size={16} className={c.termChev} />
      </button>
      {open && (
        <div id={menuId} className={c.termMenu} role="menu" aria-label="Semester">
          {options.map((o) => (
            <Link key={o.href} href={o.href} prefetch role="menuitemradio" aria-checked={!!o.selected} className={c.termItem} scroll={false} onClick={() => setOpen(false)}>
              <span>{o.label}</span>
              {o.selected && <Icon name="check" size={16} />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
