import { shortDate, weekdayName } from "@/core/time";
import { EmptyState, Tabs } from "@/ui/components";
import b from "./parts/base.module.css";
import { ClassList } from "./parts/TimetableDays";
import s from "./parts/Timetable.module.css";
import type { TimetableView } from "./views";

/** Mobile Timetable (Figma 3.1–3.6): week header, day tabs, classes, class sheet. */
export default function Timetable({ data }: { data: TimetableView & { open?: string | null } }) {
  const weekday = weekdayName(data.day);
  const next = data.nextClass;
  // 3.4 "Next: Monday 10:00, Calculus 1 in B-204." · 3.6 "Back on Wednesday, 10:00 Calculus 1."
  const nextLine = next ? `${next.label}, ${next.class.name}${next.class.room ? ` in ${next.class.room}` : ""}` : null;
  const backLine = next ? `${weekdayName(new Date(next.class.start))}, ${next.class.time} ${next.class.name}` : null;
  return (
    <div className={b.screen}>
      <header className={b.head}>
        <h1 className={b.title}>Timetable</h1>
        {data.weekLabel ? <p className={b.sub}>{data.weekLabel}</p> : null}
        {data.examWeek ? <p className={b.sub}>{data.examWeek}</p> : null}
      </header>
      <Tabs label="Day" size="l" spread className={s.tabs} items={data.week.map((d) => ({ label: d.label, value: d.day, href: `/timetable?day=${d.day}`, active: d.selected }))} />

      {data.classes.length ? (
        <ClassList key={data.day} classes={data.classes} weekday={weekday.slice(0, 3)} openKey={data.open ?? null} />
      ) : (
        <EmptyState
          className={b.bleed}
          title={data.holiday ? data.holiday.name : data.examWeek ? `No exams on ${weekday}` : `No classes on ${weekday}`}
          text={data.holiday ? `No classes on ${weekday} ${shortDate(data.day)}.${backLine ? ` Back on ${backLine}.` : ""}` : nextLine ? `Next: ${nextLine}.` : undefined}
        />
      )}
    </div>
  );
}
