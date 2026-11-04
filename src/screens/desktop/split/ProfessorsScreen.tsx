"use client";

import Link from "next/link";
import { useState } from "react";
import { Chip } from "@/ui/components";
import { ScreenHint } from "@/ui/shell/Hints";
import { PageHead } from "@/ui/shell/PageHeader";
import x from "../lists.module.css";
import type { ProfessorsData } from "../model";
import { css, cx, Face, Hint, Icon, Tag } from "../parts";
import { slugify } from "@/screens/mobile/mc/format";
import type { SortColumns } from "@/core/sort";
import { SortHeader, useSortedRows } from "@/ui/table/Sort";

type Item = ProfessorsData["items"][number];
const COLUMNS: SortColumns<Item, "name" | "dept" | "courses" | "pct"> = { name: (p) => p.name, dept: (p) => p.dept, courses: (p) => p.courses, pct: (p) => p.pct };

const shortDept = (name: string) => name.replace(/^Department of /i, "");

/** Professors — everyone who teaches, filter by name, school or department; J/K move, Enter opens. */
export function ProfessorsScreen({ data }: { data: ProfessorsData }) {
  const [q, setQ] = useState("");
  const [school, setSchool] = useState<string | null>(() => data.schools.find((s) => slugify(s) === data.initial?.school) ?? null);
  const [dept, setDept] = useState<string | null>(() => data.departments.find((d) => slugify(d.name) === data.initial?.dept)?.name ?? null);
  const needle = q.trim().toLowerCase();
  const depts = data.departments.filter((d) => !school || d.school === school);
  const filtered = data.items.filter((p) => (!school || p.school === school) && (!dept || p.dept === dept) && (!needle || `${p.name} ${p.dept} ${p.courses}`.toLowerCase().includes(needle)));
  const { rows, state } = useSortedRows(filtered, COLUMNS);
  const pickSchool = (s: string | null) => {
    setSchool(s);
    setDept(null);
  };
  return (
    <main data-desktop-screen className={cx(css.screen, x.main)}>
      <PageHead title="Professors">
        <label className={x.filter}>
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, department or course" aria-label="Filter professors" data-key="/" />
          <Hint>/ to filter</Hint>
        </label>
      </PageHead>
      <ScreenHint screen="professors" ctx={{ desktop: true }} />
      {data.schools.length > 1 && (
        <div className={css.chips}>
          <Chip size="s" label="All" selected={!school} onClick={() => pickSchool(null)} />
          {data.schools.map((s) => (
            <Chip key={s} size="s" label={s} selected={school === s} onClick={() => pickSchool(s)} />
          ))}
        </div>
      )}
      {school && depts.length > 1 && (
        <div className={css.chips} aria-label="Department">
          <Chip size="s" label="All departments" selected={!dept} onClick={() => setDept(null)} />
          {depts.map((d) => (
            <Chip key={d.name} size="s" label={shortDept(d.name)} selected={dept === d.name} onClick={() => setDept(d.name)} />
          ))}
        </div>
      )}
      <section className={cx(css.card, x.table)} data-nav-list>
        <div className={x.headRow} role="row">
          <span />
          <SortHeader state={state} k="name">Name</SortHeader>
          <SortHeader state={state} k="dept">Department</SortHeader>
          <SortHeader state={state} k="courses">Teaches</SortHeader>
          <SortHeader state={state} k="pct" style={{ textAlign: "right" }}>Pressed F</SortHeader>
        </div>
        {rows.map((p) => (
          <Link prefetch key={p.id} href={p.href} className={x.row} data-nav-item>
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
        {rows.length === 0 && <p className={cx(x.row, x.muted)}>{q ? `No one matches “${q}”.` : "No one here yet."}</p>}
      </section>
    </main>
  );
}
