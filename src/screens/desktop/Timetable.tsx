"use client";

import Link from "next/link";
import { useState } from "react";
import type { TimetableClass, TimetableData } from "./fixtures/types";
import { ButtonLink, css, cx, FileRow, Hint, Icon, Tag } from "./parts";
import t from "./timetable.module.css";

const HOUR = 64;
const HEAD = 40;

/** D3 Timetable — the week as a grid; the inspector shows the class you click. ← → change week, T today. */
export default function DesktopTimetable({ data }: { data: TimetableData }) {
  const [selected, setSelected] = useState<string | null>(data.selected ?? data.classes[0]?.id ?? null);
  const current = data.classes.find((c) => c.id === selected) ?? null;
  const hours = Array.from({ length: data.endHour - data.startHour }, (_, i) => data.startHour + i);
  const top = (minutes: number) => HEAD + ((minutes - data.startHour * 60) / 60) * HOUR;
  const height = HEAD + hours.length * HOUR + 16;

  return (
    <div className={cx(css.screen, t.split)}>
      <main className={t.main}>
        <header className={t.header}>
          <h1 className={t.title}>Timetable</h1>
          <p className={t.sub}>{data.weekLabel}</p>
          <nav className={t.weekNav} aria-label="Week">
            <Link href={data.prevHref} className={t.navBtn} data-key="ArrowLeft" aria-label="Previous week">
              ‹
            </Link>
            <Link href={data.todayHref} className={t.navBtn} data-key="t">
              This week
            </Link>
            <Link href={data.nextHref} className={t.navBtn} data-key="ArrowRight" aria-label="Next week">
              ›
            </Link>
            <Hint>← →</Hint>
          </nav>
        </header>

        <div className={t.grid} style={{ ["--days" as string]: data.days.length, height }} data-nav-list="select">
          <div className={t.gutter}>
            {hours.map((h) => (
              <span key={h} className={t.hourLabel} style={{ top: top(h * 60) }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {data.days.map((day, d) => (
            <div key={day.label} className={cx(t.day, day.today && t.dayToday)}>
              <div className={t.dayHead}>{day.label}</div>
              <div className={t.lines} />
              {data.now?.day === d && <span className={t.now} style={{ top: top(data.now.minutes) }} />}
              {data.classes
                .filter((c) => c.day === d)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={cx(t.class, t[c.tone], c.id === selected && t.classOn)}
                    style={{ top: top(c.start) + 2, height: Math.max(36, ((c.end - c.start) / 60) * HOUR + 1) }}
                    onClick={() => setSelected(c.id)}
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
        {current ? <ClassInspector c={current} onClose={() => setSelected(null)} /> : <p className={t.emptyInspector}>Click any class to see it here.</p>}
        <p className={t.tip}>Tip: click any class to see it here. ← → change week, T jumps to today.</p>
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
        <ButtonLink href={c.href} data-key="Enter">
          Open course
        </ButtonLink>
      </div>
    </>
  );
}
