"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useRef } from "react";
import { Chip, cx, s } from "./ui";
import { keyName } from "@/platform/keys";

export type SidebarProps = {
  sections: Array<{ id: string; label: string }>;
  counts: { uploads: number; reports: number };
  me: { name: string; initials: string; role: string };
};

const GROUPS = [["overview", "uploads", "reports"], ["courses", "coverage", "professors", "people"], ["broadcasts", "audit", "system"]];
/**
 * Each section is F (for Press F) then its letter, as in the app: F U uploads,
 * F R reports. No admin page uses a bare F for itself.
 */
export const SECTION_KEYS: Record<string, string> = { o: "overview", u: "uploads", r: "reports", c: "courses", v: "coverage", p: "professors", e: "people", b: "broadcasts", l: "audit", s: "system" };
const HINT: Record<string, string> = Object.fromEntries(Object.entries(SECTION_KEYS).map(([k, id]) => [id, `F ${k.toUpperCase()}`]));
export const hrefOf = (id: string) => (id === "overview" ? "/admin" : `/admin/${id}`);

export function Sidebar({ sections, counts, me }: SidebarProps) {
  const path = usePathname();
  const router = useRouter();
  const allowed = new Set(sections.map((x) => x.id));
  const pending = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      // A dialog (reject reason, confirm) keeps its own keys.
      if (document.querySelector("[aria-modal='true'], [aria-modal=''], dialog[open]")) return;
      const k = keyName(e);
      if (Date.now() - pending.current < 1500) {
        // The letter after F belongs to the sequence, never to the page.
        pending.current = 0;
        e.preventDefault();
        e.stopImmediatePropagation();
        const id = SECTION_KEYS[k];
        if (id && allowed.has(id)) router.push(hrefOf(id));
        return;
      }
      if (k === "f") {
        e.preventDefault();
        e.stopImmediatePropagation();
        pending.current = Date.now();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const active = (id: string) => (id === "overview" ? path === "/admin" : path.startsWith(hrefOf(id)));
  const groups = GROUPS.map((g) => sections.filter((x) => g.includes(x.id))).filter((g) => g.length);

  return (
    <nav className={s.sidebar} aria-label="Admin">
      <div className={s.logo}>
        <Link href="/admin" className={s.logoText}>Press F</Link>
        <Chip tone="plum">ADMIN</Chip>
      </div>
      {groups.map((g, i) => (
        <Fragment key={i}>
          {i > 0 && <div className={s.divider} role="separator" />}
          {g.map((x) => {
            const n = x.id === "uploads" ? counts.uploads : x.id === "reports" ? counts.reports : 0;
            const counted = x.id === "uploads" || x.id === "reports";
            return (
              <Link key={x.id} href={hrefOf(x.id)} prefetch className={cx(s.navItem, active(x.id) && s.navItemActive)} aria-current={active(x.id) ? "page" : undefined}>
                <span className={s.navLabel}>{x.label}</span>
                {counted ? n > 0 && <Chip tone="mustardStrong">{n}</Chip> : <span className={s.navHint}>{HINT[x.id]}</span>}
              </Link>
            );
          })}
        </Fragment>
      ))}
      <div className={s.spacer} />
      <Link href="/" className={s.me}>
        <span className={s.avatar}>{me.initials}</span>
        <span>
          <div className={s.meName}>{me.name}</div>
          <div className={s.meRole}>{me.role} · ← back to app</div>
        </span>
      </Link>
    </nav>
  );
}
