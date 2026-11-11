"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { addDays, classMeta, classTitle, clampIndex, dayAt, dayIndex, dayOf, hoursFor, mondayAt, mondayOf, SPAN_DAYS, toneName, weekLayout, weekTitle } from "@/screens/shared/schedule/model";
import { ScheduleProvider, useSchedule } from "@/screens/shared/schedule/store";
import { useNowMinutes } from "@/screens/shared/schedule/now";
import { useTrack } from "@/screens/shared/schedule/useTrack";
import { MilestoneMark } from "@/screens/shared/schedule/MilestoneMark";
import type { SchedulePage, ScheduleClass } from "@/server/views";
import { css, cx } from "../parts";
import t from "../timetable.module.css";
import { MonthGrid } from "./CalendarScreen";
import { EventChip, Inspector, ScheduleHeader } from "./ScheduleParts";

const HOUR = 64;
const DAY_HEAD = 40;
/** One all-day lane under the day heads: a 22px bar and its gap. */
const LANE = 26;
/** Weeks rendered each side of the one at the left edge; one more each side is fetched ahead. */
const AROUND = 2;
/** Room above the first hour line, so its label is not under the day heads. */
const PAD = 12;

/**
 * Timetable (D3 week, D8 month): one state, two renderers. The week is an
 * endless strip of days scrolled sideways (six fit; the hours stay on the
 * left, the day heads on top); the month scrolls through weeks endlessly. The
 * inspector shows the clicked lesson, else "Coming up".
 */
export function TimetableScreen({ page, open = null, demo = false }: { page: SchedulePage; open?: string | null; demo?: boolean }) {
  return (
    <ScheduleProvider page={page} open={open} demo={demo}>
      <div data-desktop-screen className={cx(css.screen, t.split)}>
        <main className={t.main}>
          <Body />
        </main>
        <Inspector />
      </div>
    </ScheduleProvider>
  );
}

function Body() {
  const { view } = useSchedule();
  return view === "week" ? <WeekStrip /> : <MonthGrid />;
}

/** Local labels for a day not loaded yet ("Mon 2"). */
const headOf = (day: string) => `${new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))} ${Number(day.slice(8))}`;

function WeekStrip() {
  const s = useSchedule();
  const router = useRouter();
  // The selected day's Monday at the left edge (a Sunday shows with the five days before it).
  const startDay = useMemo(() => {
    const i = dayIndex(s.day);
    return dayAt(new Date(`${s.day}T00:00:00Z`).getUTCDay() === 0 ? i - 5 : dayIndex(mondayOf(s.day)));
    // Only where the strip opens; scrolling moves it from there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { scrollRef: trackRef, probeRef: trackProbe, ...track } = useTrack({
    axis: "x",
    start: dayIndex(startDay),
    onSettle: (i) => {
      // The URL's day follows the strip: the selected day while it is in view, else the first day shown.
      const first = dayAt(i);
      if (s.day < first || s.day > addDays(first, 5)) s.setDay(first);
    },
  });
  const lead = track.lead;
  const week = Math.floor(lead / 7);
  const from = Math.max(0, week - AROUND);
  const to = Math.min(SPAN_DAYS / 7 - 1, week + AROUND);
  const { ensure } = s;
  useEffect(() => {
    const wanted: string[] = [];
    for (let w = week - AROUND - 1; w <= week + AROUND + 1; w++) if (w >= 0) wanted.push(mondayAt(w));
    ensure(wanted);
  }, [week, ensure]);

  const hours = useMemo(() => hoursFor(s.weeks), [s.weeks]);
  const days = useMemo(() => Array.from({ length: (to - from + 1) * 7 }, (_, i) => dayAt(from * 7 + i)), [from, to]);
  const layout = useMemo(() => weekLayout(s.weeks, days, hours), [s.weeks, days, hours]);
  const lanes = layout.lanes.reduce((n, x) => Math.max(n, x.lane + 1), 0);
  const head = DAY_HEAD + (lanes ? lanes * LANE + 6 : 0);
  const top = (minutes: number) => PAD + ((minutes - hours.start * 60) / 60) * HOUR;
  const hourList = Array.from({ length: hours.end - hours.start }, (_, i) => hours.start + i);
  const leftDay = dayAt(lead);
  const nowMinutes = useNowMinutes();

  const byDay = new Map<string, ScheduleClass[]>();
  for (const c of layout.classes) byDay.set(c.day, [...(byDay.get(c.day) ?? []), c]);
  const go = (index: number) => track.scrollTo(clampIndex(index, SPAN_DAYS - 6));

  return (
    <>
      <ScheduleHeader
        sub={weekTitle(s.weeks, leftDay) || headOf(leftDay)}
        unit="week"
        onPrev={() => {
          const at = Math.round(track.at());
          const monday = Math.floor(at / 7) * 7;
          go(at === monday ? monday - 7 : monday);
        }}
        onToday={() => {
          s.setDay(s.today);
          go(dayIndex(mondayOf(s.today)));
        }}
        onNext={() => go(Math.floor(Math.round(track.at()) / 7) * 7 + 7)}
      />
      <div className={t.stripBox}>
        <div ref={trackRef} className={t.strip} style={{ ["--head" as string]: `${head}px` }} data-nav-list="select" aria-label="Week, scroll sideways for more days">
          <div className={t.track} style={{ height: head + PAD + hourList.length * HOUR + 16, ["--span" as string]: SPAN_DAYS }}>
            <div ref={trackProbe} className={t.probe} aria-hidden />
            <div className={t.gutter}>
              <div className={t.corner} />
              {hourList.map((h) => (
                <span key={h} className={t.hourLabel} style={{ top: head + top(h * 60) }}>
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {Array.from({ length: to - from + 1 }, (_, n) => {
              const w = from + n;
              const monday = mondayAt(w);
              return (
                <div key={monday} className={t.weekBlock} style={{ transform: `translateX(calc(var(--gutter) + ${w * 7 - track.base} * var(--size)))` }}>
                  <div className={t.weekHead}>
                    <div className={t.heads}>
                      {Array.from({ length: 7 }, (_, d) => {
                        const day = addDays(monday, d);
                        const info = dayOf(s.weeks, day);
                        return (
                          <button key={day} type="button" className={cx(t.dayHead, day === s.today && t.headToday, day === s.day && t.headOn)} onClick={() => s.setDay(day)} aria-pressed={day === s.day} aria-current={day === s.today ? "date" : undefined}>
                            <span>{info?.weekday ?? headOf(day).split(" ")[0]}</span>
                            <span className={t.headNum}>{Number(day.slice(8))}</span>
                          </button>
                        );
                      })}
                    </div>
                    {lanes > 0 && (
                      <div className={t.lanes} style={{ height: lanes * LANE }} aria-label="All day">
                        {layout.lanes
                          .filter((x) => x.to >= n * 7 && x.from <= n * 7 + 6)
                          .map((x) => (
                            <EventChip key={x.key} e={x.event} title={x.title} className={t.laneItem} style={{ gridColumn: `${Math.max(0, x.from - n * 7) + 1} / ${Math.min(6, x.to - n * 7) + 2}`, gridRow: x.lane + 1 }} />
                          ))}
                      </div>
                    )}
                  </div>
                  <div className={t.days} style={{ height: PAD + hourList.length * HOUR + 16 }}>
                    {Array.from({ length: 7 }, (_, d) => {
                      const day = addDays(monday, d);
                      const col = n * 7 + d;
                      const info = dayOf(s.weeks, day);
                      const classes = byDay.get(day) ?? [];
                      const holiday = layout.offs.find((o) => o.day === col);
                      const off = holiday ? `Holiday · ${holiday.title}` : !classes.length ? info?.off : null;
                      return (
                        <div key={day} className={cx(t.day, day === s.today && t.dayToday)}>
                          <div className={t.lines} />
                          {off && (
                            <div className={t.dayOff}>
                              <span>{off}</span>
                            </div>
                          )}
                          {day === s.today && nowMinutes !== null && <span className={t.now} style={{ top: top(nowMinutes) }} suppressHydrationWarning />}
                          {layout.markers
                            .filter((m) => m.day === col)
                            .map((m) => (
                              <span key={m.key} className={t.marker} style={{ top: top(m.minutes) }}>
                                <EventChip e={m.event} title={m.title} />
                              </span>
                            ))}
                          {classes.map((c) => (
                            <button
                              key={c.key}
                              type="button"
                              data-lesson={c.key}
                              className={cx(t.class, t[toneName(c)], c.key === s.open && t.classOn, (c.day < s.today || (c.day === s.today && nowMinutes !== null && c.to <= nowMinutes)) && t.past)}
                              style={{ top: top(c.from) + 2, height: Math.max(36, ((c.to - c.from) / 60) * HOUR + 1) }}
                              onClick={() => s.select(c.key)}
                              // Double-click opens the course.
                              onDoubleClick={() => c.code && router.push(`/c/${c.code}`)}
                              aria-current={c.key === s.open || undefined}
                              data-nav-item
                            >
                              <span className={t.classTitle}>{classTitle(c)}</span>
                              <span className={t.classMeta}>{classMeta(c)}</span>
                              <MilestoneMark c={c} />
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
