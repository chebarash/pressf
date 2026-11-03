"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Face } from "./kit";
import s from "./mc.module.css";
import c from "./screens.module.css";

/** A tapped search result, kept on this device for the "Recent" list (Figma 7.1). */
export type RecentHit = { kind: "course" | "person" | "file"; title: string; subtitle: string; href: string };

const KEY = "pf:recent-search";
const MAX = 3;

function read(): RecentHit[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((h) => h && typeof h.href === "string" && typeof h.title === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function remember(hit: RecentHit) {
  try {
    const next = [hit, ...read().filter((h) => h.href !== hit.href)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or storage blocked: recents are a convenience only.
  }
}

/** Wraps the results: a tap on a result (`data-hit`) is remembered for "Recent". */
export function RememberHits({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={className}
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest<HTMLElement>("[data-hit]");
        if (!a?.dataset.hit) return;
        try {
          remember(JSON.parse(a.dataset.hit) as RecentHit);
        } catch {
          // Malformed attribute: nothing to remember.
        }
      }}
    >
      {children}
    </div>
  );
}

/** "Recent" before typing (7.1): the last results tapped on this device. */
export function RecentSearches() {
  const [hits, setHits] = useState<RecentHit[]>([]);
  // localStorage is only readable after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHits(read()), []);
  if (!hits.length) return null;
  return (
    <>
      <h2 className={`${s.caps} ${s.p0}`}>Recent</h2>
      {hits.map((h) => (
        <Link key={h.href} href={h.href} prefetch={false} className={c.hit}>
          {h.kind === "person" ? <Face size={48} /> : null}
          <div className={s.lines} style={{ gap: 0 }}>
            <p className={c.hitTitle}>{h.title}</p>
            <p className={c.hitSub}>{h.subtitle}</p>
          </div>
        </Link>
      ))}
    </>
  );
}
