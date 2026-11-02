"use client";

import Link from "next/link";
import { useState } from "react";
import k from "../calendar.module.css";
import type { CalendarData, CalendarKind } from "../model";
import { AnchorButton, css, cx } from "../parts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LOOK: Record<CalendarKind, string> = { week: k.week_, class: k.class_, deadline: k.deadline, exam: k.exam, registration: k.registration, holiday: k.holiday };
const BAR: Record<CalendarKind, string> = { week: "var(--school-humanities)", class: "var(--bg-accent)", deadline: "var(--rating-mid)", exam: "var(--bg-danger)", registration: "var(--school-humanities)", holiday: "var(--school-medicine)" };

export function CalendarScreen({ data }: { data: CalendarData }) {
  const [i, setI] = useState(0);
  const month = data.months[i] ?? data.months[0];
  return (
    <main className={cx(css.screen, k.main)}>
      <header className={k.header}>
        <h1 className={k.title}>{month?.label}</h1>
        <div className={k.monthNav}>
          <button type="button" className={k.navBtn} onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} data-key="ArrowLeft" aria-label="Previous month">
            ‹
          </button>
          <button type="button" className={k.navBtn} onClick={() => setI((x) => Math.min(data.months.length - 1, x + 1))} disabled={i >= data.months.length - 1} data-key="ArrowRight" aria-label="Next month">
            ›
          </button>
        </div>
        <nav className={k.filters} aria-label="Show">
          {data.filters.map((f) => (
            <Link key={f.id} href={f.href} aria-pressed={f.on} className={cx(k.filter, f.on && k.filterOn)} scroll={false}>
              {f.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className={k.body}>
        {month && (
          <div className={k.month} role="grid" aria-label={month.label}>
            <div className={k.weekdays} role="row">
              {WEEKDAYS.map((d) => (
                <span key={d} role="columnheader">
                  {d}
                </span>
              ))}
            </div>
            {month.weeks.map((week) => (
              <div key={week[0].key} className={k.week} role="row">
                {week.map((day) => (
                  <div key={day.key} role="gridcell" className={cx(k.cell, !day.inMonth && k.out, day.today && k.today)} aria-current={day.today ? "date" : undefined}>
                    <span className={k.date}>{day.date}</span>
                    {day.inMonth &&
                      day.items.slice(0, 3).map((it, n) =>
                        it.href ? (
                          <Link key={n} href={it.href} className={cx(k.event, LOOK[it.kind])}>
                            {it.title}
                          </Link>
                        ) : (
                          <span key={n} className={cx(k.event, LOOK[it.kind])}>
                            {it.title}
                          </span>
                        ),
                      )}
                    {day.inMonth && day.items.length > 3 && <span className={k.more}>+{day.items.length - 3} more</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <aside className={cx(css.card, k.coming)} aria-label="Coming up">
          <h2 className={k.comingTitle}>Coming up</h2>
          {data.empty && <p className={k.itemMeta}>{data.empty}</p>}
          {data.coming.map((c) => (
            <div key={c.title + c.meta} className={k.item}>
              <span className={k.bar} style={{ background: BAR[c.kind] }} />
              <span>
                <p className={k.itemTitle}>{c.title}</p>
                <p className={k.itemMeta}>{c.meta}</p>
              </span>
            </div>
          ))}
          <AnchorButton href={data.icsHref} variant="secondary">
            Add to my calendar
          </AnchorButton>
        </aside>
      </div>
    </main>
  );
}
