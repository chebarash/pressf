"use client";

import Link from "next/link";
import { useState } from "react";
import k from "../calendar.module.css";
import type { CalendarData, CalendarKind, ScheduleNav } from "../model";
import { css, cx } from "../parts";
import { ComingUp, ViewSwitch } from "./ScheduleParts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LOOK: Record<CalendarKind, string> = { week: k.week_, class: k.class_, deadline: k.deadline, exam: k.exam, registration: k.registration, holiday: k.holiday };

/**
 * Timetable · Month (D8, Calendar merged into Timetable): exam weeks, deadlines,
 * holidays and registration on the month, a dot per class on each day; a day's
 * date opens its week. "Coming up" beside it. ← → change month.
 */
export function CalendarScreen({ data }: { data: CalendarData & { nav: ScheduleNav } }) {
  const [i, setI] = useState(data.start ?? 0);
  const month = data.months[i] ?? data.months[0];
  const nav = data.nav;
  return (
    <main data-desktop-screen className={cx(css.screen, k.main)}>
      <header className={k.header}>
        <h1 className={k.title}>Timetable</h1>
        <p className={k.sub}>{month?.label}</p>
        <ViewSwitch nav={nav} week={month?.weekHref} />
        <div className={k.monthNav}>
          <button type="button" className={k.navBtn} onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} data-key="ArrowLeft" aria-label="Previous month">
            ‹
          </button>
          <button type="button" className={k.navBtn} onClick={() => setI(Math.max(0, data.months.findIndex((m) => m.weeks.some((w) => w.some((d) => d.today && d.inMonth)))))}>
            This month
          </button>
          <button type="button" className={k.navBtn} onClick={() => setI((x) => Math.min(data.months.length - 1, x + 1))} disabled={i >= data.months.length - 1} data-key="ArrowRight" aria-label="Next month">
            ›
          </button>
        </div>
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
            {month.weeks.map((week, w) => {
              const spans = month.spans?.[w] ?? [];
              const lanes = spans.reduce((n, x) => Math.max(n, x.lane + 1), 0);
              return (
                <div key={week[0].key} className={k.week} role="row" style={{ ["--lanes" as string]: lanes }}>
                  {spans.length > 0 && (
                    <div className={k.spans}>
                      {spans.map((x) => {
                        const style = { gridColumn: `${x.from + 1} / ${x.to + 2}`, gridRow: x.lane + 1 };
                        return x.href ? (
                          <Link key={x.key} href={x.href} className={cx(k.event, k.span, LOOK[x.kind])} style={style}>
                            {x.title}
                          </Link>
                        ) : (
                          <span key={x.key} className={cx(k.event, k.span, LOOK[x.kind])} style={style}>
                            {x.title}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {week.map((day) => (
                    <div key={day.key} role="gridcell" className={cx(k.cell, !day.inMonth && k.out, day.today && k.today)} aria-current={day.today ? "date" : undefined}>
                      {day.href ? (
                        // The date (and its class dots) opens that day's week.
                        <Link href={day.href} className={k.dayLink} aria-label={`${day.date} ${month.label}: open the week${day.classes?.length ? `, ${day.classes.length} ${day.classes.length === 1 ? "class" : "classes"}` : ""}`}>
                          <span className={k.date}>{day.date}</span>
                          {day.inMonth && !!day.classes?.length && (
                            <span className={k.dots} aria-hidden>
                              {day.classes.map((tone, n) => (
                                <span key={n} className={cx(k.dot, k[`tone_${tone}`])} />
                              ))}
                            </span>
                          )}
                        </Link>
                      ) : (
                        <span className={k.date}>{day.date}</span>
                      )}
                      {lanes > 0 && <span className={k.spanRoom} aria-hidden />}
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
              );
            })}
          </div>
        )}

        <ComingUp nav={nav} />
      </div>
    </main>
  );
}
