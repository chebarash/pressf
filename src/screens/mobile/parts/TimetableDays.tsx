"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addDays, between, classByKey, dayAt, dayIndex, dayOf, mondayAt, monthKey, monthLabel, SPAN_DAYS, SPAN_WEEKS, weekIndex, weekTitle } from "@/screens/shared/schedule/model";
import { lessonPanel } from "@/screens/shared/schedule/lesson";
import { useSchedule } from "@/screens/shared/schedule/store";
import { useTrack } from "@/screens/shared/schedule/useTrack";
import type { CalendarEvent, ScheduleClass } from "@/server/views";
import { cx, EmptyState, Tab, Tag } from "@/ui/components";
import { Sheet } from "@/ui/shell/overlays";
import { ClockIcon, PinIcon, UsersIcon } from "@/ui/icons";
import { Subscribe } from "../mc/CalendarView";
import mc from "../mc/screens.module.css";
import b from "./base.module.css";
import { FileItemRow } from "./FileItemRow";
import { MainButton } from "./MainButton";
import s from "./Timetable.module.css";

/**
 * Phone Timetable (Figma 3.1–3.7 Day, 6.1 Month): one state, two renderers.
 * Day swipes between days endlessly (the day picker slides with it); Month is
 * an endless list of the same days, classes included. A class looks the same
 * in both and opens the same sheet: that dated lesson.
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
      {st.view === "week" ? <DayPager /> : <MonthAgenda />}
      <LessonSheet />
    </>
  );
}

function WeekSub() {
  const st = useSchedule();
  const w = st.weeks.get(mondayAt(weekIndex(st.day)));
  const line = w ? [w.label, w.note].filter(Boolean).join(" · ") : weekTitle(st.weeks, st.day);
  return line ? <p className={b.sub}>{line}</p> : null;
}

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Weeks rendered each side of the selected one (one more is fetched ahead). */
const AROUND = 2;

/** Day: an endless row of days, one per screen width, swiped sideways; the picker above slides by week. */
function DayPager() {
  const st = useSchedule();
  const opening = useMemo(() => dayIndex(st.day), []); // eslint-disable-line react-hooks/exhaustive-deps
  const { scrollRef: pagerRef, probeRef: pagerProbe, ...pager } = useTrack({ axis: "x", start: opening, onSettle: (i) => st.setDay(dayAt(i)) });
  const { scrollRef: pickerRef, probeRef: pickerProbe, ...picker } = useTrack({
    axis: "x",
    start: Math.floor(opening / 7),
    // Swiping the picker to another week keeps the weekday.
    onSettle: (w) => {
      const now = dayIndex(st.day);
      if (w !== Math.floor(now / 7)) st.setDay(dayAt(w * 7 + (now % 7)));
    },
  });
  const index = dayIndex(st.day);
  const week = Math.floor(index / 7);

  // The day and the picker follow the selected day (a tap on the picker, Today, a settle).
  const { scrollTo: pageTo, at: pageAt } = pager;
  const { scrollTo: pickTo, at: pickAt } = picker;
  useEffect(() => {
    if (Math.round(pageAt()) !== index) pageTo(index);
    if (Math.round(pickAt()) !== week) pickTo(week);
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
      <div ref={pickerRef} className={s.picker} aria-label="Days">
        <div className={s.pickerTrack} style={{ ["--span" as string]: SPAN_WEEKS }}>
          <div ref={pickerProbe} className={s.probe} aria-hidden />
          {Array.from({ length: weekLast - weekFirst + 1 }, (_, n) => {
            const w = weekFirst + n;
            return (
              <nav key={w} className={s.pickerWeek} style={{ transform: `translateX(calc(${w - picker.base} * var(--size)))` }} aria-label={`Week of ${mondayAt(w)}`}>
                {WEEKDAY.map((label, d) => {
                  const day = dayAt(w * 7 + d);
                  return <Tab key={day} label={label} size="l" active={day === st.day} group={`Day ${w}`} className={cx(s.pick, day === st.today && s.pickToday)} onClick={() => st.setDay(day)} aria-label={`${label} ${Number(day.slice(8))}`} />;
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

/** One day: its all-day events, then classes and timed deadlines in time order. */
function DayPage({ day }: { day: string }) {
  const st = useSchedule();
  const { classes, events, loaded } = useMemo(() => between(st.weeks, day, day), [st.weeks, day]);
  const info = dayOf(st.weeks, day);
  const weekday = WEEKDAY[(dayIndex(day) % 7 + 7) % 7];
  if (!loaded) return <div className={s.skeleton} aria-label="Loading" />;
  const allDay = events.filter((e) => !e.time);
  const timed: Array<{ at: string; c?: ScheduleClass; e?: CalendarEvent }> = [...classes.map((c) => ({ at: c.time, c })), ...events.filter((e) => e.time).map((e) => ({ at: e.time!, e }))].sort((a, b) => a.at.localeCompare(b.at));
  if (!classes.length && !events.length) {
    const next = nextClassAfter(st.weeks, day);
    return (
      <EmptyState
        className={b.bleed}
        title={info?.off?.startsWith("Holiday") ? info.off.replace(/^Holiday · /, "") : `No classes on ${weekday}`}
        text={next ? `Next: ${WEEKDAY[(dayIndex(next.day) % 7 + 7) % 7]} ${next.time}, ${next.name}${next.room ? ` in ${next.room}` : ""}.` : info?.off && info.off !== "Weekend" ? info.off : undefined}
      />
    );
  }
  return (
    <ul className={s.list}>
      {allDay.map((e) => (
        <li key={e.key}>
          <EventRow e={e} />
        </li>
      ))}
      {timed.map((x) => (
        <li key={x.c?.key ?? x.e!.key}>{x.c ? <ClassRow c={x.c} /> : <EventRow e={x.e!} />}</li>
      ))}
    </ul>
  );
}

function nextClassAfter(weeks: ReturnType<typeof useSchedule>["weeks"], day: string): ScheduleClass | null {
  const { classes } = between(weeks, addDays(day, 1), addDays(day, 13));
  return classes[0] ?? null;
}

const isTime = (v: string | null) => !!v && /^\d{1,2}:\d{2}$/.test(v);

/** A class (3.1): time, course, teacher · room; tapping opens that lesson's sheet. The same row in Day and Month. */
export function ClassRow({ c }: { c: ScheduleClass }) {
  const st = useSchedule();
  const moved = c.changedFrom && !isTime(c.changedFrom) ? `${c.room ?? ""} (was ${c.changedFrom})` : c.room;
  const retimed = isTime(c.changedFrom) ? `moved from ${c.changedFrom}` : null;
  const details = [c.teacher?.name, moved, retimed].filter(Boolean).join(" · ");
  const live = c.day === st.today ? c.status : null;
  return (
    <button type="button" data-lesson={c.key} className={cx(s.row, (live === "next" || live === "now") && s.next, c.key === st.open && s.selected)} onClick={() => st.select(c.key)} aria-haspopup="dialog">
      <span className={s.time}>{c.time}</span>
      <span className={s.body}>
        <span className={s.subject}>{c.kind === "exam" ? `${c.name} · ${c.lesson.type}` : c.name}</span>
        {details ? <span className={s.details}>{details}</span> : null}
      </span>
      {live === "now" ? <Tag tone="dark">Now</Tag> : live === "next" ? <Tag tone="dark">Next</Tag> : null}
    </button>
  );
}

/** A calendar event (6.1 row): stripe in the layer's colour, title, what it is. The same row in Day and Month. */
export function EventRow({ e }: { e: CalendarEvent }) {
  return (
    <div className={mc.event}>
      <span className={cx(mc.stripe, mc[e.layer])} aria-hidden />
      <div className={s.eventText}>
        <p className={s.eventTitle}>{e.title}</p>
        <p className={s.eventSub}>{e.sub}</p>
      </div>
    </div>
  );
}

/** Weeks kept in the list; two load at a time at either end. */
const KEEP = 10;
const STEP = 2;

/** Month: the same days as an endless list (days with something on them, today and the selected day always). */
function MonthAgenda() {
  const st = useSchedule();
  const opening = useMemo(() => weekIndex(st.day), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [range, setRange] = useState(() => ({ from: Math.max(0, weekIndex(`${monthKey(st.day)}-01`) - 1), to: opening + 5 }));
  const list = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ week: string; top: number } | null>(null);

  const { ensure } = st;
  useEffect(() => {
    const wanted: string[] = [];
    for (let w = range.from - 1; w <= range.to + 1; w++) if (w >= 0) wanted.push(mondayAt(w));
    ensure(wanted);
  }, [range, ensure]);

  // Opens at the selected day.
  useLayoutEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-day="${st.day}"]`);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 96 });
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep what is on screen still when weeks come or go above it.
  const remember = () => {
    const weeks = [...(list.current?.querySelectorAll<HTMLElement>("[data-week]") ?? [])];
    const el = weeks.find((w) => w.getBoundingClientRect().bottom > 0) ?? weeks[0];
    anchor.current = el ? { week: el.dataset.week!, top: el.getBoundingClientRect().top } : null;
  };
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    if (!a) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-week="${a.week}"]`);
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
          if (e.target === endRef.current) setRange((r) => ({ from: r.to + STEP - r.from + 1 > KEEP ? r.from + STEP : r.from, to: r.to + STEP }));
          else setRange((r) => (r.from === 0 ? r : { from: Math.max(0, r.from - STEP), to: r.to - r.from + STEP + 1 > KEEP ? r.to - STEP : r.to }));
        }
      },
      { rootMargin: "800px 0px" },
    );
    if (topRef.current) io.observe(topRef.current);
    if (endRef.current) io.observe(endRef.current);
    return () => io.disconnect();
  }, []);

  // The URL's day follows the list: the first day at the top once scrolling stops, unless the selected one is on screen.
  const { setDay } = st;
  const selected = st.day;
  useEffect(() => {
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const days = [...(list.current?.querySelectorAll<HTMLElement>("[data-day]") ?? [])];
        const shown = days.filter((d) => {
          const r = d.getBoundingClientRect();
          return r.bottom > 80 && r.top < window.innerHeight;
        });
        if (shown.length && !shown.some((d) => d.dataset.day === selected)) setDay(shown[0].dataset.day!);
      }, 200);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, [selected, setDay]);

  const weeks = Array.from({ length: range.to - range.from + 1 }, (_, n) => range.from + n);
  return (
    <div ref={list} className={s.agenda}>
      <Subscribe google={st.page.subscribe.google} personal={st.page.subscribe.personal} feed={st.page.feed?.layers ?? null} />
      <div ref={topRef} aria-hidden />
      {weeks.map((w) => (
        <AgendaWeek key={w} week={w} />
      ))}
      <div ref={endRef} className={s.skeleton} aria-label="Loading" />
    </div>
  );
}

function AgendaWeek({ week }: { week: number }) {
  const st = useSchedule();
  const monday = mondayAt(week);
  const loaded = st.weeks.get(monday);
  const days = Array.from({ length: 7 }, (_, i) => dayAt(week * 7 + i));
  const firstOfMonth = days.find((d) => d.endsWith("-01"));
  return (
    <section data-week={monday} className={s.agendaWeek} aria-label={`Week of ${monday}`}>
      {firstOfMonth ? <h2 className={s.month}>{monthLabel(firstOfMonth)}</h2> : null}
      {!loaded ? (
        <div className={s.skeleton} />
      ) : (
        days.map((day) => {
          const { classes, events } = between(st.weeks, day, day);
          // A multi-day event shows once, on its first day ("11–15 Jan" in its line).
          const own = events.filter((e) => e.day === day);
          const items = [...own.filter((e) => !e.time).map((e) => ({ at: "", e })), ...[...classes.map((c) => ({ at: c.time, c })), ...own.filter((e) => e.time).map((e) => ({ at: e.time!, e }))].sort((a, b) => a.at.localeCompare(b.at))] as Array<{ at: string; c?: ScheduleClass; e?: CalendarEvent }>;
          const keep = items.length || day === st.today || day === st.day;
          if (!keep) return null;
          const info = loaded.days.find((d) => d.day === day)!;
          return (
            <div key={day} data-day={day} className={mc.day}>
              <h3 className={cx(mc.dayLabel, day === st.today && mc.dayToday, day === st.day && s.daySelected)}>
                <button type="button" className={s.dayBtn} onClick={() => st.setDay(day)}>
                  {info.weekday} {info.date}
                  {day === st.today ? " · today" : ""}
                </button>
              </h3>
              {items.length ? (
                items.map((x) => (x.c ? <ClassRow key={x.c.key} c={x.c} /> : <EventRow key={x.e!.key} e={x.e!} />))
              ) : (
                <p className={s.eventSub}>{info.off ?? "No classes"}</p>
              )}
            </div>
          );
        })
      )}
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
      {p.lmsHref ? (
        <a href={p.lmsHref} target="_blank" rel="noopener noreferrer" className={s.lms}>
          Open in LMS
        </a>
      ) : null}
      {qr ? <MainButton text="Scan QR" href="/qr" secondary={p.courseHref ? { text: "Open course", href: p.courseHref } : null} /> : p.courseHref ? <MainButton text={`Open ${c.name}`} href={p.courseHref} /> : null}
    </Sheet>
  );
}
