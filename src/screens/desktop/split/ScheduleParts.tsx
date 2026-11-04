"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { lessonPanel } from "@/screens/shared/schedule/lesson";
import { classByKey } from "@/screens/shared/schedule/model";
import { useSchedule } from "@/screens/shared/schedule/store";
import type { CalendarEvent, CalendarLayer, ScheduleClass } from "@/server/views";
import { Tab } from "@/ui/components";
import { ScreenHint } from "@/ui/shell/Hints";
import { PageHead } from "@/ui/shell/PageHeader";
import k from "../calendar.module.css";
import type { CalendarKind } from "../model";
import { ButtonLink, css, cx, FileRow, Hint, Icon, Tag } from "../parts";
import t from "../timetable.module.css";

/**
 * What Timetable's Week and Month share (they are two renderers of one state):
 * the header with the Week | Month switch and ‹ Today ›, the inspector (the
 * clicked lesson, else "Coming up"). The Google Calendar feed lives in
 * Settings → Calendar; Timetable only offers it once, as a hint.
 */

export const KIND: Record<CalendarLayer, CalendarKind> = { classes: "class", exams: "exam", deadlines: "deadline", holidays: "holiday", registration: "registration" };
export const LOOK: Record<CalendarKind, string> = { week: k.week_, class: k.class_, deadline: k.deadline, exam: k.exam, registration: k.registration, holiday: k.holiday };
export const BAR: Record<CalendarKind, string> = { week: "var(--school-humanities)", class: "var(--bg-accent)", deadline: "var(--rating-mid)", exam: "var(--bg-danger)", registration: "var(--school-humanities)", holiday: "var(--school-medicine)" };

/** Week | Month (Figma Tab): switches the renderer in place; the day and the open class stay. */
export function ViewSwitch() {
  const s = useSchedule();
  return (
    <nav aria-label="View" className={t.views}>
      {(["week", "month"] as const).map((v) => (
        <Tab key={v} label={v === "week" ? "Week" : "Month"} active={s.view === v} group="View" onClick={() => s.setView(v)} aria-current={s.view === v ? "page" : undefined} />
      ))}
    </nav>
  );
}

/** The header both views share: title, what is on screen, the switch, ‹ Today › (← → on the keyboard). */
export function ScheduleHeader({ sub, unit, onPrev, onToday, onNext }: { sub: string; unit: "week" | "month"; onPrev: () => void; onToday: () => void; onNext: () => void }) {
  return (
    <>
    <PageHead title="Timetable" sub={sub} className={t.head}>
      <ViewSwitch />
      <nav className={t.weekNav} aria-label={unit === "week" ? "Week" : "Month"}>
        <button type="button" className={t.navBtn} onClick={onPrev} data-key="ArrowLeft" aria-label={`Previous ${unit}`}>
          ‹
        </button>
        <button type="button" className={t.navBtn} onClick={onToday} aria-label={unit === "week" ? "Today, this week" : "Today, this month"}>
          Today
        </button>
        <button type="button" className={t.navBtn} onClick={onNext} data-key="ArrowRight" aria-label={`Next ${unit}`}>
          ›
        </button>
        <Hint>← →</Hint>
      </nav>
    </PageHead>
    <ScreenHint screen="timetable" ctx={{ desktop: true }} className={t.hint} />
    </>
  );
}

/** A calendar event as a bar or chip (both views). */
export function EventChip({ e, title, className, style }: { e: CalendarEvent; title?: string; className?: string; style?: React.CSSProperties }) {
  const cls = cx(k.event, LOOK[KIND[e.layer]], className);
  const text = title ?? e.title;
  return e.href ? (
    <Link prefetch href={e.href} className={cls} style={style} title={`${e.title} · ${e.sub}`}>
      {text}
    </Link>
  ) : (
    <span className={cls} style={style} title={`${e.title} · ${e.sub}`}>
      {text}
    </span>
  );
}

/** The right pane of both views: the selected lesson, else "Coming up". */
export function Inspector() {
  const s = useSchedule();
  const current = classByKey(s.weeks, s.open);
  const ref = useRef<HTMLElement>(null);
  // On a narrow page the panel sits under the grid: bring the lesson into view when one is picked.
  useEffect(() => {
    const el = ref.current;
    if (!s.open || !el || el.getBoundingClientRect().top < window.innerHeight - 80) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, [s.open]);
  return (
    <aside ref={ref} className={cx(css.inspector, t.inspector)} aria-label={current ? "Lesson" : "Coming up"}>
      {current ? <LessonInspector c={current} onClose={() => s.select(null)} /> : <ComingUp />}
      <p className={t.tip}>Tip: click any class to see that lesson here. ← → move a {s.view}, F T back to today, F K the month.</p>
    </aside>
  );
}

const ATT: Record<string, string> = { ok: t.attOk, late: t.attLate, bad: t.attBad, none: t.attNone };

/** One dated lesson: when and where, the topic, attendance, mark, homework, files. */
export function LessonInspector({ c, onClose }: { c: ScheduleClass; onClose: () => void }) {
  const p = lessonPanel(c);
  return (
    <>
      <div className={t.tags}>
        {p.tags.map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
        <span className={t.spacer} />
        <button type="button" className={css.textBtn} onClick={onClose} data-key="Escape" aria-label="Close">
          <Hint>Esc</Hint>
        </button>
      </div>
      {p.live && <p className={t.live}>● {p.live}</p>}
      <h2 className={t.inspectorTitle}>{p.title}</h2>
      <Fact icon={<Icon name="clock" size={16} />}>
        {p.when}
        {p.whenWas && <span className={t.was}>moved from {p.whenWas}</span>}
      </Fact>
      {p.room && (
        <Fact icon={<Icon name="pin" size={16} />}>
          {p.room}
          {p.roomWas && <span className={t.was}>moved from {p.roomWas}</span>}
        </Fact>
      )}
      {p.teacher && <Fact icon={<Icon name="users" size={16} />}>{p.teacher}</Fact>}
      {p.exam && <Fact icon={<Icon name="calendar" size={16} />}>{p.exam}</Fact>}

      {(p.topic.title || p.topic.description || p.topic.syllabus) && (
        <section className={t.block} aria-label="This lesson">
          <p className={t.label}>This lesson</p>
          {p.topic.title && <p className={t.topic}>{p.topic.title}</p>}
          {p.topic.description && <p className={t.note}>{p.topic.description}</p>}
          {p.topic.syllabus && <p className={t.note}>Syllabus: {p.topic.syllabus}</p>}
        </section>
      )}

      {p.attendance && (
        <div className={t.att}>
          <span className={t.label}>Attendance</span>
          <span className={cx(t.attMark, ATT[p.attendance.tone])}>
            {p.attendance.label}
            {p.attendance.qr ? " · QR" : ""}
          </span>
        </div>
      )}
      {p.absences && (
        <p className={t.absences}>
          {p.absences.line}
          <b>{p.absences.left}</b>
        </p>
      )}
      {p.grade && (
        <div className={t.att}>
          <span className={t.label}>Mark in this lesson</span>
          <b className={t.grade}>{p.grade}</b>
        </div>
      )}

      {p.homework.length > 0 && (
        <section className={t.block} aria-label="Homework due">
          <p className={t.label}>Due this day</p>
          {p.homework.map((h) => (
            <Link prefetch key={h.id} href="/progress/assignments" className={t.homework}>
              <span className={t.topic}>{h.title}</span>
              <span className={t.note}>{h.meta}</span>
            </Link>
          ))}
        </section>
      )}

      {p.files.length > 0 && (
        <section className={t.block} aria-label="Files of this lesson">
          <p className={t.label}>Files of this lesson</p>
          {p.files.map((f) => (
            <FileRow key={f.id} file={{ id: f.id, title: f.title, type: f.type, date: f.dateLabel, source: f.source, from: f.from, href: f.href }} hideCourse />
          ))}
        </section>
      )}

      {p.courseHref && (
        <div className={t.actions}>
          <ButtonLink href={p.courseHref} keyName="Enter">
            Open course
          </ButtonLink>
        </div>
      )}
    </>
  );
}

const Fact = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <p className={cx(css.factLine, t.fact)}>
    {icon}
    <span>{children}</span>
  </p>
);

/** "Coming up": exams, deadlines, holidays and registration from today. */
export function ComingUp({ className }: { className?: string }) {
  const { page } = useSchedule();
  return (
    <section className={cx(css.card, k.coming, className)} aria-label="Coming up">
      <h2 className={k.comingTitle}>Coming up</h2>
      {!page.coming.length && <p className={k.itemMeta}>Nothing coming up.</p>}
      {page.coming.map((c) => (
        <div key={c.key} className={k.item}>
          <span className={k.bar} style={{ background: BAR[KIND[c.layer]] }} />
          <span>
            <p className={k.itemTitle}>{c.title}</p>
            <p className={k.itemMeta}>{c.sub}</p>
          </span>
        </div>
      ))}
    </section>
  );
}
