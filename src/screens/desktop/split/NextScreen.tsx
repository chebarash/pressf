"use client";

import { useState } from "react";
import type { SortColumns } from "@/core/sort";
import { SortHeader, useSortedRows } from "@/ui/table/Sort";
import type { NextData, NextRow } from "../model";
import x from "../next.module.css";
import { AnchorButton, css, cx, Empty, Face, RatingStrip } from "../parts";

const COLUMNS: SortColumns<NextRow, "name" | "ects" | "recommend" | "hours" | "difficulty" | "prereq"> = {
  name: (r) => r.name,
  ects: (r) => r.ects,
  recommend: (r) => r.recommendPct,
  hours: (r) => r.hoursValue ?? r.hours,
  difficulty: (r) => r.difficultyValue ?? r.difficulty,
  prereq: (r) => r.prereq?.name,
};

/** D16 Next semester — the study plan as a table; the selected course's cohorts on the right. */
export function NextScreen({ data }: { data: NextData }) {
  const [code, setCode] = useState(data.rows[0]?.code ?? null);
  const sel = data.rows.find((r) => r.code === code) ?? null;
  const { rows, state } = useSortedRows(data.rows, COLUMNS);
  return (
    <main data-desktop-screen className={cx(css.screen, x.main)}>
      <p className={x.eyebrow}>{data.eyebrow}</p>
      <header className={x.head}>
        <h1 className={x.title}>{data.title}</h1>
        {data.dates.map((d) => (
          <span key={d.title + d.note} className={x.date}>
            <b>{d.title}</b>
            <span>{d.note}</span>
          </span>
        ))}
      </header>

      {data.missing || data.rows.length === 0 ? (
        <Empty title="No study plan yet">When the LMS publishes your study plan for next semester, its courses show up here.</Empty>
      ) : (
        <div className={x.body}>
          <section className={cx(css.card, x.table)} data-nav-list="select" data-nav-arrows>
            <div className={x.headRow} role="row">
              <SortHeader state={state} k="name">Course</SortHeader>
              <SortHeader state={state} k="ects">ECTS</SortHeader>
              <SortHeader state={state} k="recommend">Recommend</SortHeader>
              <SortHeader state={state} k="hours">Hours</SortHeader>
              <SortHeader state={state} k="difficulty">Difficulty</SortHeader>
              <SortHeader state={state} k="prereq">Prerequisite</SortHeader>
            </div>
            {rows.map((r) => (
              <button key={r.code + r.name} type="button" className={cx(x.row, r.code === code && x.rowOn)} onClick={() => setCode(r.code)} aria-current={r.code === code || undefined} data-nav-item>
                <span className={x.name}>
                  <b>{r.name}</b>
                  <span>{r.meta}</span>
                </span>
                <span>{r.ects ?? "—"}</span>
                <span className={x.pct}>{r.recommendPct != null ? `${r.recommendPct}%` : "—"}</span>
                <span>{r.hours}</span>
                <span>{r.difficulty}</span>
                <span className={x.pre}>
                  <b>{r.prereq?.name ?? "—"}</b>
                  <span className={cx(r.prereq?.ok && x.ok, (r.prereq?.status === "in progress" || r.prereq?.status === "missing") && x.late)}>{r.prereq?.status || "none"}</span>
                </span>
              </button>
            ))}
          </section>

          {sel && (
            <aside className={cx(css.card, x.inspector)} aria-label={sel.name}>
              <p className={x.eyebrow}>{sel.detail.eyebrow}</p>
              <h2 className={x.inspectorTitle}>{sel.name}</h2>
              <RatingStrip strip={sel.detail.strip} />
              {sel.detail.cohorts.length > 0 && (
                <>
                  <p className={x.label}>Compare cohorts</p>
                  {sel.detail.cohorts.map((c) => (
                    <div key={c.title} className={cx(x.cohort, c.ok && x.cohortOk)}>
                      <Face src={c.face} size={36} />
                      <span className={x.cohortText}>
                        <b>{c.title}</b>
                        {c.line && <span>{c.line}</span>}
                        {c.note && <em className={cx(!c.ok && x.clash)}>{c.note}</em>}
                      </span>
                      {c.pct != null && (
                        <span className={x.f}>
                          <b>{c.pct}%</b>pressed F
                        </span>
                      )}
                    </div>
                  ))}
                </>
              )}
              <AnchorButton className={x.cta} href={data.lmsHref} target="_blank" rel="noopener">
                Open cohort selection in LMS
              </AnchorButton>
              <p className={x.fine}>{data.note}</p>
            </aside>
          )}
        </div>
      )}
    </main>
  );
}
