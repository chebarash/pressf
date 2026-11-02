"use client";

import Link from "next/link";
import { useState } from "react";
import k from "./calendar.module.css";
import type { CalendarData, CalendarKind } from "./fixtures/types";
import { ButtonLink, css, cx } from "./parts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LOOK: Record<CalendarKind, string> = { week: k.week_, deadline: k.deadline, exam: k.exam, registration: k.registration, holiday: k.holiday };
const BAR: Record<CalendarKind, string> = { week: "var(--school-humanities)", deadline: "var(--rating-mid)", exam: "var(--bg-danger)", registration: "var(--school-humanities)", holiday: "var(--school-medicine)" };
/** Which filter shows which kind (week markers ride with classes). */
const FILTER_OF: Record<CalendarKind, CalendarData["filters"][number]["id"]> = { week: "classes", deadline: "deadlines", exam: "exams", registration: "registration", holiday: "holidays" };

/** D8 Calendar — the month with exams, deadlines, holidays and registration; "Coming up" beside it. ← → change month. */
export default function DesktopCalendar({ data }: { data: CalendarData }) {
  const [on, setOn] = useState(() => new Set(data.filters.filter((f) => f.on).map((f) => f.id)));
  const shows = (kind: CalendarKind) => on.has(FILTER_OF[kind]) || kind === "week";
  const toggle = (id: CalendarData["filters"][number]["id"]) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className={cx(css.screen, k.main)}>
      <header className={k.header}>
        <h1 className={k.title}>{data.month}</h1>
        <Link href={data.prevHref} className={css.srOnly} data-key="ArrowLeft">
          Previous month
        </Link>
        <Link href={data.nextHref} className={css.srOnly} data-key="ArrowRight">
          Next month
        </Link>
        <div className={k.filters} role="group" aria-label="Show">
          {data.filters.map((f) => (
            <button key={f.id} type="button" aria-pressed={on.has(f.id)} className={cx(k.filter, on.has(f.id) && k.filterOn)} onClick={() => toggle(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className={k.body}>
        <div className={k.month} role="grid" aria-label={data.month}>
          <div className={k.weekdays} role="row">
            {WEEKDAYS.map((d) => (
              <span key={d} role="columnheader">
                {d}
              </span>
            ))}
          </div>
          {data.weeks.map((week, w) => (
            <div key={w} className={k.week} role="row">
              {week.map((day) => (
                <div key={`${w}-${day.date}`} role="gridcell" className={cx(k.cell, !day.inMonth && k.out, day.today && k.today)} aria-current={day.today ? "date" : undefined}>
                  <span className={k.date}>{day.date}</span>
                  {day.items.filter((i) => shows(i.kind)).map((i) =>
                    i.href ? (
                      <Link key={i.title} href={i.href} className={cx(k.event, LOOK[i.kind])}>
                        {i.title}
                      </Link>
                    ) : (
                      <span key={i.title} className={cx(k.event, LOOK[i.kind])}>
                        {i.title}
                      </span>
                    ),
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <aside className={cx(css.card, k.coming)} aria-label="Coming up">
          <h2 className={k.comingTitle}>Coming up</h2>
          {data.coming.filter((c) => shows(c.kind)).map((c) => (
            <div key={c.title + c.meta} className={k.item}>
              <span className={k.bar} style={{ background: BAR[c.kind] }} />
              <span>
                <p className={k.itemTitle}>{c.title}</p>
                <p className={k.itemMeta}>{c.meta}</p>
              </span>
            </div>
          ))}
          <ButtonLink href={data.icsHref} variant="secondary" prefetch={false}>
            Add to my calendar
          </ButtonLink>
        </aside>
      </div>
    </main>
  );
}
