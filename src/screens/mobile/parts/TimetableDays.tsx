"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addDays, between, classByKey, dayAt, dayIndex, dayOf, mondayAt, monthKey, monthLabel, shiftMonth, SPAN_DAYS, SPAN_WEEKS, toneName, weekIndex, weekTitle, type Weeks } from "@/screens/shared/schedule/model";
import { lessonPanel } from "@/screens/shared/schedule/lesson";
import { clock, useNowMinutes } from "@/screens/shared/schedule/now";
import { useSchedule } from "@/screens/shared/schedule/store";
import { useTrack } from "@/screens/shared/schedule/useTrack";
import type { CalendarEvent, CalendarLayer, ScheduleClass } from "@/server/views";
import { cx, EmptyState, Tab, Tag } from "@/ui/components";
import { ScreenHint } from "@/ui/shell/Hints";
import { Sheet } from "@/ui/shell/overlays";
import { ClockIcon, PinIcon, UsersIcon } from "@/ui/icons";
import b from "./base.module.css";
import { FileItemRow } from "./FileItemRow";
import { MainButton } from "./MainButton";
import s from "./Timetable.module.css";

/**
 * Phone Timetable (Figma 3.1–3.7 Day, 6.1 Month): one state, two renderers.
 * Day is the default: a week strip (weekday, date, a dot per class) over the
 * day's classes in time order with a now-line between them; the day swipes
 * endlessly, the strip by week. Month is a light overview: endless month grids
 * with dots, a tap opens that day. A class opens the sheet of that dated lesson.
 * The Google Calendar feed lives in Settings → Calendar; here only a hint.
 */
export function PhoneTimetable({ title }: { title: React.ReactNode }) {
  const st = useSchedule();
  return (
    <>
      <header className={b.head}>
        <div className={s.titleRow}>
          {title}
          <nav aria-label="View" className={s.views}>
            <Tab label="Day" active={st.view === "week"} group="View" onClick={() => st.setView("week")} />
            <Tab label="Month" active={st.view === "month"} group="View" onClick={() => st.setView("month")} />
          </nav>
        </div>
        {st.view === "week" ? <WeekSub /> : null}
      </header>
      <ScreenHint screen="timetable" ctx={{ desktop: false }} className={s.hint} />
      {st.view === "week" ? <DayPager /> : <MonthOverview />}
      <LessonSheet />
    </>
  );
}

/** The week's label ("Week 9") and, away from today, the way back to it. */
function WeekSub() {
  const st = useSchedule();
  const w = st.weeks.get(mondayAt(weekIndex(st.day)));
  const line = w ? [w.label, w.note].filter(Boolean).join(" · ") : weekTitle(st.weeks, st.day);
  const away = st.day !== st.today;
  if (!line && !away) return null;
  return (
    <div className={s.subRow}>
      <p className={cx(b.sub, s.subLine)}>{line}</p>
      {away ? (
        <button type="button" className={s.todayBtn} onClick={() => st.setDay(st.today)}>
          Today
        </button>
      ) : null}
    </div>
  );
}

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const weekdayOf = (day: string) => WEEKDAY[((dayIndex(day) % 7) + 7) % 7];
/** Weeks rendered each side of the selected one (one more is fetched ahead). */
const AROUND = 2;
/** Further than this, a jump (Today, a month tap) lands at once instead of scrolling through every day. */
const SMOOTH_DAYS = 7;

/** Colour classes for a calendar layer's stripe or dot. */
const LAYER: Record<CalendarLayer, string> = { classes: s.l_classes, exams: s.l_exams, deadlines: s.l_deadlines, holidays: s.l_holidays, registration: s.l_registration };
const TONE = (c: ScheduleClass) => s[`tone_${toneName(c)}`];

/** Up to three dots for a day: its classes in their course colours, then its events in theirs. */
function dotsOf(weeks: Weeks, day: string): string[] {
  const { classes, events } = between(weeks, day, day);
  const out = [...classes.map(TONE), ...events.filter((e) => e.layer !== "holidays").map((e) => LAYER[e.layer])];
  return out.slice(0, 3);
}

/** Day: an endless row of days, one per screen width, swiped sideways; the week strip above slides by week. */
function DayPager() {
  const st = useSchedule();
  const opening = useMemo(() => dayIndex(st.day), []); // eslint-disable-line react-hooks/exhaustive-deps
  const { scrollRef: pagerRef, probeRef: pagerProbe, ...pager } = useTrack({ axis: "x", start: opening, onSettle: (i) => st.setDay(dayAt(i)) });
  const { scrollRef: pickerRef, probeRef: pickerProbe, ...picker } = useTrack({
    axis: "x",
    start: Math.floor(opening / 7),
    // Swiping the strip to another week keeps the weekday.
    onSettle: (w) => {
      const now = dayIndex(st.day);
      if (w !== Math.floor(now / 7)) st.setDay(dayAt(w * 7 + (now % 7)));
    },
  });
  const index = dayIndex(st.day);
  const week = Math.floor(index / 7);

  // The day and the strip follow the selected day (a tap on the strip, Today, a settle).
  const { scrollTo: pageTo, at: pageAt } = pager;
  const { scrollTo: pickTo, at: pickAt } = picker;
  useEffect(() => {
    const from = pageAt();
    if (Math.round(from) !== index) pageTo(index, Math.abs(from - index) <= SMOOTH_DAYS);
    const fromWeek = pickAt();
    if (Math.round(fromWeek) !== week) pickTo(week, Math.abs(fromWeek - week) <= 1);
  }, [index, week, pageTo, pageAt, pickTo, pickAt]);

  const { ensure } = st;
  useEffect(() => {
    const wanted: string[] = [];
    for (let w = week - AROUND - 1; w <= week + AROUND + 1; w++) if (w >= 0) wanted.push(mondayAt(w));
    ensure(wanted);
  }, [week, ensure]);

  const lead = Math.floor(pager.lead / 7);
  const first = Math.max(0, Math.min(week, lead) - AROUND) * 7;
  const last = Math.min(SPAN_DAYS - 1, (Math.max(week, lead) + AROUND) * 7 + 6);

  // The row is as tall as the day on screen (and the next one, mid-swipe).
  const heights = useRef(new Map<number, number>());
  const trackRef = useRef<HTMLDivElement>(null);
  const panels = useRef(new Set<HTMLElement>());
  const observer = useRef<ResizeObserver | null>(null);
  const fit = useRef(() => {});
  useEffect(() => {
    fit.current = () => {
      const at = Math.floor(pageAt());
      const h = Math.max(heights.current.get(at) ?? 0, heights.current.get(at + 1) ?? 0, 120);
      if (trackRef.current) trackRef.current.style.height = `${h}px`;
    };
    fit.current();
  });
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) heights.current.set(Number((e.target as HTMLElement).dataset.index), (e.target as HTMLElement).offsetHeight);
      fit.current();
    });
    observer.current = ro;
    panels.current.forEach((el) => ro.observe(el));
    return () => {
      ro.disconnect();
      observer.current = null;
    };
  }, []);
  const measure = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    panels.current.add(el);
    observer.current?.observe(el);
    return () => {
      panels.current.delete(el);
      observer.current?.unobserve(el);
    };
  }, []);

  const weekFirst = Math.max(0, Math.floor(first / 7));
  const weekLast = Math.min(SPAN_WEEKS - 1, Math.floor(last / 7));
  return (
    <div className={s.wrap}>
      <div ref={pickerRef} className={s.picker} aria-label="Days, swipe for other weeks">
        <div className={s.pickerTrack} style={{ ["--span" as string]: SPAN_WEEKS }}>
          <div ref={pickerProbe} className={s.probe} aria-hidden />
          {Array.from({ length: weekLast - weekFirst + 1 }, (_, n) => {
            const w = weekFirst + n;
            return (
              <nav key={w} className={s.pickerWeek} style={{ transform: `translateX(calc(${w - picker.base} * var(--size)))` }} aria-label={`Week of ${mondayAt(w)}`}>
                {WEEKDAY.map((label, d) => {
                  const day = dayAt(w * 7 + d);
                  const on = day === st.day;
                  const dots = dotsOf(st.weeks, day);
                  return (
                    <button
                      key={day}
                      type="button"
                      className={cx(s.pick, on && s.pickOn, day === st.today && s.pickToday)}
                      onClick={() => st.setDay(day)}
                      aria-pressed={on}
                      aria-current={day === st.today ? "date" : undefined}
                      aria-label={`${label} ${Number(day.slice(8))}${dots.length ? `, ${dots.length === 3 ? "3 or more" : dots.length} on` : ""}`}
                    >
                      <span className={s.pickDay}>{label.slice(0, 2)}</span>
                      <span className={s.pickNum}>{Number(day.slice(8))}</span>
                      <span className={s.dots} aria-hidden>
                        {dots.map((tone, i) => (
                          <i key={i} className={cx(s.dot, tone)} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </nav>
            );
          })}
        </div>
      </div>
      <div ref={pagerRef} className={s.pager} aria-label="Classes, swipe for other days">
        <div ref={trackRef} className={s.pagerTrack} style={{ ["--span" as string]: SPAN_DAYS }}>
          <div ref={pagerProbe} className={s.probe} aria-hidden />
          {Array.from({ length: last - first + 1 }, (_, n) => {
            const i = first + n;
            return (
              <div key={i} ref={measure} data-index={i} className={s.page} style={{ transform: `translateX(calc(${i - pager.base} * var(--size)))` }} aria-hidden={i !== index || undefined}>
                <DayPage day={dayAt(i)} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type Timed = { at: number; key: string; c?: ScheduleClass; e?: CalendarEvent };
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** One day: its all-day events as one-line rows, then classes and timed deadlines in time order, with the now-line today. */
function DayPage({ day }: { day: string }) {
  const st = useSchedule();
  const now = useNowMinutes();
  const { classes, events, loaded } = useMemo(() => between(st.weeks, day, day), [st.weeks, day]);
  const info = dayOf(st.weeks, day);
  if (!loaded) return <div className={s.skeleton} aria-label="Loading" />;
  const allDay = events.filter((e) => !e.time);
  const timed: Timed[] = [...classes.map((c) => ({ at: c.from, key: c.key, c })), ...events.filter((e) => e.time).map((e) => ({ at: minutes(e.time!), key: e.key, e }))].sort((a, b) => a.at - b.at);
  const isToday = day === st.today;
  // The now-line goes before the first item that has not ended yet.
  const nowAt = isToday && now !== null ? timed.findIndex((x) => (x.c ? x.c.to : x.at) > now) : -2;
  const ended = (x: Timed) => day < st.today || (isToday && now !== null && (x.c ? x.c.to : x.at) <= now);
  const holiday = info?.off?.startsWith("Holiday") ? info.off.replace(/^Holiday · /, "") : null;
  return (
    <div className={s.dayBody}>
      {allDay.length ? (
        <ul className={s.allDay} aria-label="All day">
          {allDay.map((e) => (
            <li key={e.key}>
              <AllDayRow e={e} />
            </li>
          ))}
        </ul>
      ) : null}
      {!classes.length ? (
        <EmptyDay day={day} holiday={holiday} off={info?.off ?? null} quiet={timed.length > 0 || allDay.length > 0} />
      ) : null}
      {timed.length ? (
        <ul className={s.list}>
          {timed.map((x, i) => (
            <Fragment key={x.key}>
              {i === nowAt ? <NowLine minutes={now!} /> : null}
              <li className={cx(ended(x) && s.ended)}>{x.c ? <ClassRow c={x.c} /> : <EventRow e={x.e!} />}</li>
            </Fragment>
          ))}
          {nowAt === -1 && classes.length ? <NowLine minutes={now!} /> : null}
        </ul>
      ) : null}
    </div>
  );
}

function NowLine({ minutes: m }: { minutes: number }) {
  return (
    <li className={s.nowLine} aria-label={`Now, ${clock(m)}`}>
      <span className={s.nowTime}>{clock(m)}</span>
    </li>
  );
}

/** A day without classes says why, and when the next one is. */
function EmptyDay({ day, holiday, off, quiet }: { day: string; holiday: string | null; off: string | null; quiet: boolean }) {
  const st = useSchedule();
  const next = nextClassAfter(st.weeks, day);
  const title = holiday ?? (off === "Weekend" ? "Weekend" : `No classes on ${weekdayOf(day)}`);
  const text = next ? `Next: ${whenDay(next.day, day)} ${next.time}, ${next.name}${next.room ? ` in ${next.room}` : ""}.` : off && off !== "Weekend" && !holiday ? off : undefined;
  if (quiet)
    return (
      <p className={s.emptyLine}>
        {title}
        {text ? ` · ${text}` : ""}
      </p>
    );
  return <EmptyState className={b.bleed} title={title} text={text} />;
}

/** "Thu" within the coming week, else "Mon 9 Nov". */
const whenDay = (day: string, from: string) =>
  dayIndex(day) - dayIndex(from) < 7 && weekIndex(day) === weekIndex(from) ? weekdayOf(day) : `${weekdayOf(day)} ${Number(day.slice(8))} ${new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}`;

function nextClassAfter(weeks: Weeks, day: string): ScheduleClass | null {
  const { classes } = between(weeks, addDays(day, 1), addDays(day, 13));
  return classes[0] ?? null;
}

const isTime = (v: string | null) => !!v && /^\d{1,2}:\d{2}$/.test(v);

/** A class (3.1): its course colour, the time it runs, course, room · teacher; tapping opens that lesson's sheet. */
export function ClassRow({ c }: { c: ScheduleClass }) {
  const st = useSchedule();
  const moved = c.changedFrom && !isTime(c.changedFrom) ? `${c.room ?? ""} (was ${c.changedFrom})` : c.room;
  const retimed = isTime(c.changedFrom) ? `moved from ${c.changedFrom}` : null;
  const details = [moved, c.teacher?.name, retimed].filter(Boolean).join(" · ");
  const live = c.day === st.today ? c.status : null;
  return (
    <button type="button" data-lesson={c.key} className={cx(s.row, TONE(c), live === "now" && s.live, c.key === st.open && s.selected)} onClick={() => st.select(c.key)} aria-haspopup="dialog">
      <span className={s.stripe} aria-hidden />
      <span className={s.time}>
        <span>{c.time}</span>
        <span className={s.until}>{c.endTime}</span>
      </span>
      <span className={s.body}>
        <span className={s.subject}>{c.kind === "exam" ? `${c.name} · ${c.lesson.type}` : c.name}</span>
        {details ? <span className={s.details}>{details}</span> : null}
      </span>
      {live === "now" ? <Tag tone="dark">Now</Tag> : live === "next" ? <Tag tone="neutral">Next</Tag> : null}
    </button>
  );
}

/** A timed calendar event (a deadline at 23:59): a slim row in its layer's colour. */
export function EventRow({ e }: { e: CalendarEvent }) {
  const body = (
    <>
      <span className={cx(s.stripe, LAYER[e.layer])} aria-hidden />
      <span className={s.time}>
        <span>{e.time}</span>
      </span>
      <span className={s.body}>
        <span className={s.eventTitle}>{e.title}</span>
        <span className={s.details}>{e.sub}</span>
      </span>
    </>
  );
  return e.href ? (
    <Link prefetch href={e.href} className={cx(s.row, s.eventRow)}>
      {body}
    </Link>
  ) : (
    <div className={cx(s.row, s.eventRow)}>{body}</div>
  );
}

/** An all-day or multi-day event (exam weeks, holidays, registration): one line at the top of the day. */
function AllDayRow({ e }: { e: CalendarEvent }) {
  const kind = e.sub.split(" · ")[0];
  return (
    <div className={s.allDayRow} title={`${e.title} · ${e.sub}`}>
      <span className={cx(s.allDayDot, LAYER[e.layer])} aria-hidden />
      <span className={s.allDayTitle}>{e.title}</span>
      {kind && kind !== e.title ? <span className={s.allDayKind}>{kind}</span> : null}
    </div>
  );
}

/** Months kept in the list; one loads at a time at either end. */
const KEEP_MONTHS = 6;
const monthsAt = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return y * 12 + mo - 1;
};
const monthOf = (n: number) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;

/**
 * Month: a light overview. Endless month grids (seven columns, the date and up
 * to three dots per day, exam and holiday days tinted); tapping a day opens it
 * in Day.
 */
function MonthOverview() {
  const st = useSchedule();
  const opening = useMemo(() => monthsAt(monthKey(st.day)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [range, setRange] = useState(() => ({ from: opening - 1, to: opening + 2 }));
  const list = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ month: string; top: number } | null>(null);

  const { ensure } = st;
  useEffect(() => {
    const first = `${monthOf(range.from)}-01`;
    const last = addDays(`${shiftMonth(monthOf(range.to), 1)}-01`, -1);
    const wanted: string[] = [];
    for (let w = weekIndex(first); w <= weekIndex(last); w++) wanted.push(mondayAt(w));
    ensure(wanted);
  }, [range, ensure]);

  // Opens at the selected day's month.
  useLayoutEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-month="${monthKey(st.day)}"]`);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 96 });
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep what is on screen still when months come or go above it.
  const remember = () => {
    const months = [...(list.current?.querySelectorAll<HTMLElement>("[data-month]") ?? [])];
    const el = months.find((m) => m.getBoundingClientRect().bottom > 0) ?? months[0];
    anchor.current = el ? { month: el.dataset.month!, top: el.getBoundingClientRect().top } : null;
  };
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    if (!a) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-month="${a.month}"]`);
    if (el) window.scrollBy(0, el.getBoundingClientRect().top - a.top);
  }, [range]);

  const topRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          remember();
          if (e.target === endRef.current) setRange((r) => ({ from: r.to + 1 - r.from + 1 > KEEP_MONTHS ? r.from + 1 : r.from, to: r.to + 1 }));
          else setRange((r) => ({ from: r.from - 1, to: r.to - r.from + 2 > KEEP_MONTHS ? r.to - 1 : r.to }));
        }
      },
      { rootMargin: "600px 0px" },
    );
    if (topRef.current) io.observe(topRef.current);
    if (endRef.current) io.observe(endRef.current);
    return () => io.disconnect();
  }, []);

  // The URL's day follows the list: the first of the month at the top once scrolling stops, unless the selected day's month is on screen.
  const { setDay } = st;
  const selected = st.day;
  useEffect(() => {
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const months = [...(list.current?.querySelectorAll<HTMLElement>("[data-month]") ?? [])].filter((m) => {
          const r = m.getBoundingClientRect();
          return r.bottom > 120 && r.top < window.innerHeight;
        });
        if (months.length && !months.some((m) => m.dataset.month === monthKey(selected))) setDay(`${months[0].dataset.month}-01`);
      }, 200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [selected, setDay]);

  const months = Array.from({ length: range.to - range.from + 1 }, (_, n) => monthOf(range.from + n));
  return (
    <div ref={list} className={s.months}>
      <div className={s.weekdays} aria-hidden>
        {WEEKDAY.map((d) => (
          <span key={d}>{d.slice(0, 2)}</span>
        ))}
      </div>
      <div ref={topRef} aria-hidden />
      {months.map((m) => (
        <MonthBlock key={m} month={m} />
      ))}
      <div ref={endRef} className={s.skeleton} aria-label="Loading" />
    </div>
  );
}

function MonthBlock({ month }: { month: string }) {
  const st = useSchedule();
  const first = `${month}-01`;
  const lead = ((dayIndex(first) % 7) + 7) % 7;
  const count = Number(addDays(`${shiftMonth(month, 1)}-01`, -1).slice(8));
  const loaded = st.weeks.has(mondayAt(weekIndex(first))) && st.weeks.has(mondayAt(weekIndex(`${month}-${String(count).padStart(2, "0")}`)));
  return (
    <section data-month={month} className={s.monthBlock} aria-label={monthLabel(first)}>
      <h2 className={s.month}>{monthLabel(first)}</h2>
      <div className={s.grid} role="grid" aria-busy={!loaded || undefined}>
        {Array.from({ length: lead }, (_, i) => (
          <span key={`pad${i}`} aria-hidden />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const day = addDays(first, i);
          const { events } = between(st.weeks, day, day);
          const dots = dotsOf(st.weeks, day);
          const exam = events.some((e) => e.layer === "exams");
          const holiday = events.some((e) => e.layer === "holidays") || dayOf(st.weeks, day)?.off?.startsWith("Holiday");
          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              className={cx(s.cell, day === st.today && s.cellToday, day === st.day && s.cellOn, exam && s.cellExam, holiday && s.cellHoliday)}
              aria-current={day === st.today ? "date" : undefined}
              aria-label={`${weekdayOf(day)} ${Number(day.slice(8))} ${monthLabel(day)}${exam ? ", exams" : ""}${holiday ? ", holiday" : ""}`}
              onClick={() => {
                st.setDay(day);
                st.setView("week");
              }}
            >
              <span className={s.cellNum}>{i + 1}</span>
              <span className={s.dots} aria-hidden>
                {dots.map((tone, k) => (
                  <i key={k} className={cx(s.dot, tone)} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The sheet of the selected lesson (3.2, 3.3): the same facts as the desktop inspector. */
function LessonSheet() {
  const st = useSchedule();
  const c = useMemo(() => classByKey(st.weeks, st.open), [st.open, st.weeks]);
  return c ? <LessonSheetOf key={c.key} c={c} /> : null;
}

function LessonSheetOf({ c }: { c: ScheduleClass }) {
  const st = useSchedule();
  const { select } = st;
  const close = useCallback(() => select(null), [select]);
  // When the sheet opened, for the QR window.
  const [openedAt] = useState(() => Date.now());
  const p = lessonPanel(c);
  // QR check-in is offered from 5 min before the class until it ends.
  const live = c.day === st.today ? c.status : null;
  const qr = live === "now" || (live === "next" && openedAt >= Date.parse(c.start) - 5 * 60_000);
  return (
    <Sheet label={c.name} onClose={close} className={s.sheet}>
      <div className={s.tags}>
        {p.tags.map((t) => (
          <Tag key={t} tone="accent">
            {t}
          </Tag>
        ))}
      </div>
      {p.live ? <p className={s.now}>● {p.live}</p> : null}
      <h2 className={s.sheetTitle}>{p.title}</h2>
      <p className={s.fact}>
        <ClockIcon size={16} />
        {p.when}
        {p.whenWas ? <span className={s.was}>{p.whenWas}</span> : null}
      </p>
      {p.room ? (
        <p className={s.fact}>
          <PinIcon size={16} />
          {p.room}
          {p.roomWas ? <span className={s.was}>{p.roomWas}</span> : null}
        </p>
      ) : null}
      {p.teacher ? (
        <p className={s.fact}>
          <UsersIcon size={16} />
          {p.teacher}
        </p>
      ) : null}
      {p.exam ? <p className={s.fact}>{p.exam}</p> : null}
      {p.topic.title || p.topic.description || p.topic.syllabus ? (
        <div className={s.block}>
          <p className={b.label}>This lesson</p>
          {p.topic.title ? <p className={s.topic}>{p.topic.title}</p> : null}
          {p.topic.description ? <p className={s.eventSub}>{p.topic.description}</p> : null}
          {p.topic.syllabus ? <p className={s.eventSub}>Syllabus: {p.topic.syllabus}</p> : null}
        </div>
      ) : null}
      {p.attendance ? (
        <p className={s.absences}>
          <span>Attendance</span>
          <strong className={cx(s.mark, s[`mark_${p.attendance.tone}`])}>
            {p.attendance.label}
            {p.attendance.qr ? " · QR" : ""}
          </strong>
        </p>
      ) : null}
      {p.absences ? (
        <p className={s.absences}>
          <span>{p.absences.line}</span>
          <strong>{p.absences.left}</strong>
        </p>
      ) : null}
      {p.grade ? (
        <p className={s.absences}>
          <span>Mark in this lesson</span>
          <strong>{p.grade}</strong>
        </p>
      ) : null}
      {p.homework.length ? (
        <div className={s.block}>
          <p className={b.label}>Due this day</p>
          {p.homework.map((h) => (
            <Link prefetch key={h.id} href="/progress/assignments" className={s.homework}>
              <span className={s.topic}>{h.title}</span>
              <span className={s.eventSub}>{h.meta}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {p.files.length ? (
        <>
          <p className={b.label}>Files of this lesson</p>
          {p.files.map((f) => (
            <FileItemRow key={f.id} file={f} />
          ))}
        </>
      ) : null}
      {qr ? <MainButton text="Scan QR" href="/qr" secondary={p.courseHref ? { text: "Open course", href: p.courseHref } : null} /> : p.courseHref ? <MainButton text={`Open ${c.name}`} href={p.courseHref} /> : null}
    </Sheet>
  );
}
