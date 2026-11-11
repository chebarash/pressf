"use client";

import { useEffect, useMemo } from "react";
import { MilestoneMark } from "@/screens/shared/schedule/MilestoneMark";
import { addDays, classTitle, clampIndex, dayAt, firstOfMonth, monthKey, monthLabel, mondayAt, monthLayout, shiftMonth, SPAN_WEEKS, toneName, weekIndex } from "@/screens/shared/schedule/model";
import { useSchedule } from "@/screens/shared/schedule/store";
import { useTrack } from "@/screens/shared/schedule/useTrack";
import type { CalendarEvent, ScheduleClass } from "@/server/views";
import k from "../calendar.module.css";
import { cx } from "../parts";
import t from "../timetable.module.css";
import { EventChip, ScheduleHeader } from "./ScheduleParts";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Rows rendered above and below the one at the top; a month needs six. */
const ABOVE = 2;
const BELOW = 8;
/** Items shown in a day before "+N more". */
const SHOWN = 3;

/**
 * Timetable · Month (D8): the same weeks as the Week, as an endless column of
 * week rows. Multi-day phases are bars across their days; each day lists its
 * events and its classes (the same cards, in the course colour, opening the
 * same lesson panel). Days outside the month in view are dimmed; the selected
 * day is highlighted. ← → move a month.
 */
export function MonthGrid() {
  const s = useSchedule();
  // The selected day's month opens with its first week at the top.
  const start = useMemo(() => weekIndex(firstOfMonth(monthKey(s.day))), []); // eslint-disable-line react-hooks/exhaustive-deps
  const { scrollRef: trackRef, probeRef: trackProbe, ...track } = useTrack({
    axis: "y",
    start,
    onSettle: (row) => {
      // The URL's day follows: the selected day while its row is in view, else the first day shown.
      const first = mondayAt(row);
      if (s.day < first || s.day > addDays(first, 34)) s.setDay(first);
    },
  });
  const lead = track.lead;
  const from = Math.max(0, lead - ABOVE);
  const to = Math.min(SPAN_WEEKS - 1, lead + BELOW);
  const { ensure } = s;
  useEffect(() => {
    const wanted: string[] = [];
    for (let w = lead - ABOVE - 1; w <= lead + BELOW + 1; w++) if (w >= 0) wanted.push(mondayAt(w));
    ensure(wanted);
  }, [lead, ensure]);

  // The month in view: the one most of the five rows from the top belong to.
  const month = useMemo(() => {
    const count = new Map<string, number>();
    for (let i = 0; i < 35; i++) {
      const m = monthKey(dayAt(lead * 7 + i));
      count.set(m, (count.get(m) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }, [lead]);
  const goMonth = (m: string) => track.scrollTo(clampIndex(weekIndex(firstOfMonth(m)), SPAN_WEEKS - 6));

  return (
    <>
      <ScheduleHeader sub={monthLabel(firstOfMonth(month))} unit="month" onPrev={() => goMonth(shiftMonth(month, -1))} onToday={() => { s.setDay(s.today); goMonth(monthKey(s.today)); }} onNext={() => goMonth(shiftMonth(month, 1))} />
      <div className={t.stripBox}>
        <div ref={trackRef} className={cx(t.monthScroll, k.month)} role="grid" aria-label={monthLabel(firstOfMonth(month))} data-nav-list="select">
          <div className={k.weekdays} role="row">
            {WEEKDAYS.map((d) => (
              <span key={d} role="columnheader">
                {d}
              </span>
            ))}
          </div>
          <div className={t.monthTrack} style={{ ["--span" as string]: SPAN_WEEKS }}>
            <div ref={trackProbe} className={t.rowProbe} aria-hidden />
            {Array.from({ length: to - from + 1 }, (_, n) => (
              <WeekRow key={from + n} week={from + n} base={track.base} month={month} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function WeekRow({ week, base, month }: { week: number; base: number; month: string }) {
  const s = useSchedule();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayAt(week * 7 + i)), [week]);
  const layout = useMemo(() => monthLayout(s.weeks, days), [s.weeks, days]);
  const lanes = layout.lanes.reduce((n, x) => Math.max(n, x.lane + 1), 0);
  return (
    <div className={cx(k.week, t.monthRow)} role="row" style={{ ["--lanes" as string]: lanes, transform: `translateY(calc(${week - base} * var(--row)))` }}>
      {lanes > 0 && (
        <div className={cx(k.spans, t.monthSpans)}>
          {layout.lanes.map((x) => (
            <EventChip key={x.key} e={x.event} title={x.title} className={k.span} style={{ gridColumn: `${x.from + 1} / ${x.to + 2}`, gridRow: x.lane + 1 }} />
          ))}
        </div>
      )}
      {days.map((day) => {
        const items: Array<{ at: string; e?: CalendarEvent; c?: ScheduleClass }> = [
          ...layout.single.filter((e) => e.day === day).map((e) => ({ at: e.time ?? "", e })),
          ...layout.classes.filter((c) => c.day === day).map((c) => ({ at: c.time, c })),
        ].sort((a, b) => a.at.localeCompare(b.at));
        return (
          <div key={day} role="gridcell" className={cx(k.cell, monthKey(day) !== month && k.out, day === s.today && k.today, day === s.day && t.cellOn)} aria-current={day === s.today ? "date" : undefined}>
            <button type="button" className={k.dayLink} onClick={() => s.setDay(day)} aria-pressed={day === s.day} aria-label={`${Number(day.slice(8))} ${monthLabel(day)}`}>
              <span className={k.date}>{Number(day.slice(8))}</span>
            </button>
            {lanes > 0 && <span className={k.spanRoom} style={{ height: lanes * 30 - 4 }} aria-hidden />}
            {items.slice(0, SHOWN).map((it) =>
              it.c ? (
                <button
                  key={it.c.key}
                  type="button"
                  data-lesson={it.c.key}
                  className={cx(t.chip, t[toneName(it.c)], it.c.key === s.open && t.classOn)}
                  onClick={() => s.select(it.c!.key)}
                  aria-current={it.c.key === s.open || undefined}
                  title={`${classTitle(it.c)} · ${it.c.time}${it.c.room ? ` · ${it.c.room}` : ""}`}
                  data-nav-item
                >
                  {/* A syllabus quiz takes the time's place: the chip is too narrow for both (the time stays in its title). */}
                  {it.c.milestones?.length ? <MilestoneMark c={it.c} inline compact /> : `${it.c.time} `}
                  {classTitle(it.c)}
                </button>
              ) : (
                <EventChip key={it.e!.key} e={it.e!} />
              ),
            )}
            {items.length > SHOWN && (
              <button type="button" className={cx(k.more, t.moreBtn)} onClick={() => { s.setDay(day); s.setView("week"); }}>
                +{items.length - SHOWN} more
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
