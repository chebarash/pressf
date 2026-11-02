"use client";

import Link from "next/link";
import { useState } from "react";
import { Chip } from "@/ui/components";
import x from "../lists.module.css";
import type { ProfessorsData } from "../model";
import { css, cx, Face, Hint, Icon, Tag } from "../parts";

/** Professors — everyone who teaches, filter by name or school; J/K move, Enter opens. */
export function ProfessorsScreen({ data }: { data: ProfessorsData }) {
  const [q, setQ] = useState("");
  const [school, setSchool] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const rows = data.items.filter((p) => (!school || p.school === school) && (!needle || `${p.name} ${p.dept} ${p.courses}`.toLowerCase().includes(needle)));
  return (
    <main className={cx(css.screen, x.main)}>
      <header className={x.head}>
        <h1 className={x.title}>Professors</h1>
        <label className={x.filter}>
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, department or course" aria-label="Filter professors" data-key="/" />
          <Hint>/</Hint>
        </label>
      </header>
      {data.schools.length > 1 && (
        <div className={css.chips}>
          <Chip size="s" label="All" selected={!school} onClick={() => setSchool(null)} />
          {data.schools.map((s) => (
            <Chip key={s} size="s" label={s} selected={school === s} onClick={() => setSchool(s)} />
          ))}
        </div>
      )}
      <section className={cx(css.card, x.table)} data-nav-list>
        <div className={x.headRow}>
          <span />
          <span>Name</span>
          <span>Department</span>
          <span>Teaches</span>
          <span style={{ textAlign: "right" }}>Pressed F</span>
        </div>
        {rows.map((p) => (
          <Link key={p.id} href={p.href} className={x.row} data-nav-item>
            <Face src={p.face} size={40} />
            <span>
              <span className={x.name}>{p.name}</span>
              {p.yours && (
                <span className={x.yours}>
                  <Tag>Yours</Tag>
                </span>
              )}
            </span>
            <span className={x.muted}>{p.dept || "—"}</span>
            <span className={x.muted}>{p.courses || "—"}</span>
            <span className={x.pct}>{p.pct != null ? `${p.pct}%` : "—"}</span>
          </Link>
        ))}
        {rows.length === 0 && <p className={cx(x.row, x.muted)}>No one matches “{q}”.</p>}
      </section>
    </main>
  );
}
