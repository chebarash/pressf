"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import k from "../calendar.module.css";
import type { CalendarKind, TimetableClass, TimetableData } from "../model";
import { ButtonLink, css, cx, FileRow, Hint, Icon, Tag } from "../parts";
import t from "../timetable.module.css";
import { ComingUp, ViewSwitch } from "./ScheduleParts";

const HOUR = 64;
const DAY_HEAD = 40;
/** One all-day lane under the day heads: a 22px bar and its gap. */
const LANE = 26;
const LOOK: Record<CalendarKind, string> = { week: k.week_, class: k.class_, deadline: k.deadline, exam: k.exam, registration: k.registration, holiday: k.holiday };

/**
 * Timetable · Week (D3): the classes as a grid, with the calendar laid over it
 * (exam weeks, holidays and registration as bars under the day heads, deadlines
 * as lines at their time). The inspector shows the class you click; with none,
 * "Coming up". ← → change week, F T this week, F K the month.
 */
export function TimetableScreen({ data }: { data: TimetableData }) {
  const router = useRouter();
  // The merged Timetable starts with nothing picked (its panel shows "Coming up"); the bare grid picks the next class.
  const [selected, setSelected] = useState<string | null>(data.nav ? (data.selected ?? null) : (data.selected ?? data.classes[0]?.id ?? null));
  const current = data.classes.find((c) => c.id === selected) ?? null;
  const hours = Array.from({ length: data.endHour - data.startHour }, (_, i) => data.startHour + i);
  const lanes = (data.overlays?.lanes ?? []).reduce((n, x) => Math.max(n, x.lane + 1), 0);
  const head = DAY_HEAD + (lanes ? lanes * LANE + 6 : 0);
  const top = (minutes: number) => head + ((minutes - data.startHour * 60) / 60) * HOUR;
  const height = head + hours.length * HOUR + 16;

  return (
    <div data-desktop-screen className={cx(css.screen, t.split)}>
      <main className={t.main}>
        <header className={t.header}>
          <h1 className={t.title}>Timetable</h1>
          <p className={t.sub}>{data.weekLabel}</p>
          {data.nav && <ViewSwitch nav={data.nav} />}
          <nav className={t.weekNav} aria-label="Week">
            <Link prefetch href={data.prevHref} className={t.navBtn} data-key="ArrowLeft" aria-label="Previous week">
              ‹
            </Link>
            <Link prefetch href={data.todayHref} className={t.navBtn}>
              This week
            </Link>
            <Link prefetch href={data.nextHref} className={t.navBtn} data-key="ArrowRight" aria-label="Next week">
              ›
            </Link>
            <Hint>← →</Hint>
          </nav>
        </header>

        <div className={t.grid} style={{ ["--days" as string]: data.days.length, ["--head" as string]: `${head}px`, height }} data-nav-list="select">
          {lanes > 0 && (
            <div className={t.lanes} style={{ height: lanes * LANE }} aria-label="All day">
              {data.overlays!.lanes.map((x) => {
                const style = { gridColumn: `${x.from + 1} / ${x.to + 2}`, gridRow: x.lane + 1 };
                return x.href ? (
                  <Link prefetch key={x.key} href={x.href} className={cx(k.event, t.laneItem, LOOK[x.kind])} style={style} title={x.title}>
                    {x.title}
                  </Link>
                ) : (
                  <span key={x.key} className={cx(k.event, t.laneItem, LOOK[x.kind])} style={style} title={x.title}>
                    {x.title}
                  </span>
                );
              })}
            </div>
          )}
          <div className={t.gutter}>
            {hours.map((h) => (
              <span key={h} className={t.hourLabel} style={{ top: top(h * 60) }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {data.days.map((day, d) => (
            <div key={day.label} className={cx(t.day, day.today && t.dayToday)}>
              {day.loaded ? (
                <div className={t.dayHead}>{day.label}</div>
              ) : (
                <Link prefetch href={day.href} className={cx(t.dayHead, t.dayLink)}>
                  {day.label}
                  {day.count > 0 && <span className={t.dayCount}>{day.count}</span>}
                </Link>
              )}
              <div className={t.lines} />
              {/* A day with no classes says why: a holiday, a break, registration week. */}
              {day.off && (
                <div className={t.dayOff}>
                  <span>{day.off}</span>
                </div>
              )}
              {data.now?.day === d && <span className={t.now} style={{ top: top(data.now.minutes) }} suppressHydrationWarning />}
              {/* Deadlines due inside the hours shown: a line at the due time. */}
              {data.overlays?.markers
                .filter((m) => m.day === d)
                .map((m) => (
                  <Link prefetch key={m.key} href={m.href ?? "/progress/assignments"} className={t.marker} style={{ top: top(m.minutes) }} title={m.title}>
                    <span className={cx(k.event, k.deadline)}>{m.title}</span>
                  </Link>
                ))}
              {data.classes
                .filter((c) => c.day === d)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={cx(t.class, t[c.tone], c.id === selected && t.classOn)}
                    style={{ top: top(c.start) + 2, height: Math.max(36, ((c.end - c.start) / 60) * HOUR + 1) }}
                    onClick={() => setSelected(c.id)}
                    // Double-click opens the course.
                    onDoubleClick={() => c.href && router.push(c.href)}
                    aria-current={c.id === selected || undefined}
                    data-nav-item
                  >
                    <span className={t.classTitle}>{c.title}</span>
                    <span className={t.classMeta}>{c.meta}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </main>

      <aside className={css.inspector} aria-label="Class">
        {current ? (
          <ClassInspector c={current} onClose={() => setSelected(null)} />
        ) : data.nav ? (
          <>
            {data.empty && <p className={t.emptyInspector}>{data.empty}</p>}
            <ComingUp nav={data.nav} />
          </>
        ) : (
          <p className={t.emptyInspector}>{data.empty ?? "Click any class to see it here."}</p>
        )}
        <p className={t.tip}>Tip: click any class to see it here. ← → change week, F T back to this week, F K the month.</p>
      </aside>
    </div>
  );
}

function ClassInspector({ c, onClose }: { c: TimetableClass; onClose: () => void }) {
  return (
    <>
      <div className={t.tags}>
        {c.tags.map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
        <span className={t.spacer} />
        <button type="button" className={css.textBtn} onClick={onClose} data-key="Escape" aria-label="Close">
          <Hint>Esc</Hint>
        </button>
      </div>
      <h2 className={t.inspectorTitle}>{c.title.replace(/ · MIDTERM$/i, "")}</h2>
      <p className={css.factLine}>
        <Icon name="clock" size={16} />
        {c.when}
      </p>
      {c.room && (
        <p className={css.factLine}>
          <Icon name="pin" size={16} />
          {c.room}
        </p>
      )}
      {c.teacher && (
        <p className={css.factLine}>
          <Icon name="users" size={16} />
          {c.teacher}
        </p>
      )}
      {c.files.length > 0 && (
        <>
          <p className={t.label}>Materials for this class</p>
          {c.files.map((f) => (
            <FileRow key={f.id} file={f} hideCourse />
          ))}
        </>
      )}
      {c.absences && (
        <p className={t.absences}>
          {c.absences.line}
          <b>{c.absences.left}</b>
        </p>
      )}
      <div>
        <ButtonLink href={c.href} keyName="Enter">
          Open course
        </ButtonLink>
      </div>
    </>
  );
}
