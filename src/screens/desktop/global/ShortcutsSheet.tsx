"use client";

import { useEffect, useRef, useState } from "react";
import s from "../parts/parts.module.css";
import { GO_TO, SHORTCUTS_EVENT } from "./bus";
import o from "./overlay.module.css";
import { keyName } from "@/platform/keys";

const COLUMNS: Array<{ title: string; rows: Array<[string, string[]]> }> = [
  { title: "Go to", rows: GO_TO.filter((g) => g.key !== "u").map((g) => [g.label, ["G", g.key.toUpperCase()]]) },
  {
    title: "Anywhere",
    rows: [
      ["Search and commands", ["⌘", "K"]],
      ["Same, Press F style", ["F"]],
      ["This list", ["?"]],
      ["Dark theme", ["⇧", "D"]],
      ["Close / back", ["Esc"]],
    ],
  },
  {
    title: "On a page",
    rows: [
      ["Move in lists", ["J", "K"]],
      ["Open", ["↵"]],
      ["Rate this course", ["R"]],
      ["Previous / next week", ["←", "→"]],
      ["Jump to today", ["T"]],
    ],
  },
];

/** D11 Keyboard shortcuts: opened with ? (or the sidebar button). */
export function ShortcutsSheet() {
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen((v) => !v);
    window.addEventListener(SHORTCUTS_EVENT, onOpen);
    return () => window.removeEventListener(SHORTCUTS_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || keyName(e) === "?") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className={`${o.scrim} ${o.center}`} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)} data-keyboard-scope>
      <div className={o.sheet} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div className={o.sheetHead}>
          <h2 id="shortcuts-title" className={o.sheetTitle}>
            Keyboard shortcuts
          </h2>
          <button ref={close} type="button" className={o.escBtn} onClick={() => setOpen(false)} aria-label="Close">
            <kbd className={s.key}>Esc</kbd>
          </button>
        </div>
        <div className={o.columns}>
          {COLUMNS.map((c) => (
            <div key={c.title} className={o.column}>
              <h3>{c.title}</h3>
              {c.rows.map(([label, keys]) => (
                <div key={label} className={o.row}>
                  <span>{label}</span>
                  <span className={s.keys}>
                    {keys.map((k) => (
                      <kbd key={k} className={s.key}>
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className={o.sheetNote}>Shortcuts never fire while you type in a field. On the phone everything is a tap.</p>
      </div>
    </div>
  );
}
