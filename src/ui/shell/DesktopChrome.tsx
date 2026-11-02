"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { LinkTelegram } from "./LinkTelegram";
import { NAV } from "./nav";
import { Dialog } from "./overlays";
import { Sidebar, type SidebarProps } from "./Sidebar";

const typing = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/** ⌘K / F search palette: jump to a section or search for anything. */
function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const items = NAV.filter((n) => n.label.toLowerCase().includes(q.trim().toLowerCase()));
  const go = (href: string) => { onClose(); router.push(href); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (items[active]) go(items[active].href);
    else if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  const total = items.length + (q.trim() ? 1 : 0);
  return (
    <>
      <div className="sh-scrim" onClick={onClose} />
      <div className="sh-palette-wrap" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="sh-palette" role="dialog" aria-modal="true" aria-label="Search">
          <form onSubmit={submit} role="search">
            <Icon name="search" size={20} />
            <input
              autoFocus
              aria-label="Search"
              placeholder="Course, professor, file"
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, total - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              }}
            />
            <kbd className="sh-kbd">Esc</kbd>
          </form>
          <div className="sh-palette__list" role="listbox" aria-label="Results">
            {items.map((n, i) => (
              <button key={n.href} type="button" role="option" aria-selected={i === active} className="sh-palette__item" data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(n.href)}>
                <Icon name={n.icon} size={18} />
                <span>{n.label}</span>
                {n.badge !== "new" && <kbd className="sh-kbd">G {n.key.toUpperCase()}</kbd>}
              </button>
            ))}
            {q.trim() && (
              <button type="button" role="option" aria-selected={active === items.length} className="sh-palette__item" data-active={active === items.length} onMouseEnter={() => setActive(items.length)} onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}>
                <Icon name="search" size={18} />
                <span>Search for “{q.trim()}”</span>
                <kbd className="sh-kbd">↵</kbd>
              </button>
            )}
          </div>
          <p className="sh-palette__hint"><span>↑↓ to move</span><span>↵ to open</span><span>Esc to close</span></p>
        </div>
      </div>
    </>
  );
}

function Shortcuts({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [["⌘K or F", "Search"], ...NAV.filter((n) => n.badge !== "new").map((n) => [`G ${n.key.toUpperCase()}`, n.label] as [string, string]), ["?", "These shortcuts"], ["Esc", "Close"]];
  return (
    <Dialog label="Keyboard shortcuts" onClose={onClose}>
      <div className="sh-link-text">
        <h2 className="sh-sheet__title">Shortcuts</h2>
        <dl className="sh-shortcuts">
          {rows.map(([keys, label]) => (
            <div key={label}><dt><kbd className="sh-kbd sh-kbd--key">{keys}</kbd></dt><dd>{label}</dd></div>
          ))}
        </dl>
      </div>
    </Dialog>
  );
}

/** The desktop sidebar plus its keyboard layer, palette and Telegram hand-off. */
export function DesktopChrome(props: Omit<SidebarProps, "onSearch" | "onShortcuts" | "onLinkTelegram">) {
  const router = useRouter();
  const [overlay, setOverlay] = useState<"palette" | "shortcuts" | "link" | null>(null);
  const pendingG = useRef(0);
  const close = useCallback(() => setOverlay(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOverlay((o) => (o === "palette" ? null : "palette")); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || overlay) return;
      const key = e.key.toLowerCase();
      if (Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        const item = NAV.find((n) => n.key === key && n.badge !== "new");
        if (item) { e.preventDefault(); router.push(item.href); }
        return;
      }
      if (key === "g") pendingG.current = Date.now();
      else if (key === "f") { e.preventDefault(); setOverlay("palette"); }
      else if (e.key === "?") { e.preventDefault(); setOverlay("shortcuts"); }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [overlay, router]);

  return (
    <>
      <Sidebar {...props} onSearch={() => setOverlay("palette")} onShortcuts={() => setOverlay("shortcuts")} onLinkTelegram={() => setOverlay("link")} />
      {overlay === "palette" && <Palette onClose={close} />}
      {overlay === "shortcuts" && <Shortcuts onClose={close} />}
      <LinkTelegram open={overlay === "link"} onClose={close} />
    </>
  );
}
