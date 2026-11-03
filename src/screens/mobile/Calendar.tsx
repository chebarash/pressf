import type { CalendarView } from "@/server/views";
import { TimetableTitle, type TimetableViewLinks } from "./parts/TimetableViews";
import { Subscribe } from "./mc/CalendarView";
import type { FeedLayer } from "./mc/FeedLayers";
import { EmptyState } from "./mc/kit";
import { cx, Screen } from "./mc/parts";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";

/**
 * Mobile Timetable · Month (Figma 6.1, 6.3 added to phone): the old Calendar,
 * now Timetable's month. Exams, deadlines, holidays and registration, always
 * all of them (classes are in Day); "Add to Google Calendar" with the feed's own
 * settings under it.
 */
export default function Calendar({
  data,
  subscribed,
  views,
  feed = null,
}: {
  data: CalendarView;
  /** Dev preview of 6.3: open with the toast showing. */
  subscribed?: boolean;
  views?: TimetableViewLinks;
  /** "In Google Calendar" for a signed-in student. */
  feed?: FeedLayer[] | null;
}) {
  const title = <h1 className={cx(s.title, "t-mobile-title")}>Timetable</h1>;
  return (
    <Screen>
      <div className={cx(s.body, s.gap16)} style={{ paddingBottom: 32 }}>
        {views ? <TimetableTitle title={title} views={views} active="month" /> : title}
        {data.days.map((d) => (
          <section key={d.day + d.label} className={c.day} aria-label={d.label}>
            <h2 className={cx(c.dayLabel, d.today && c.dayToday)}>{d.label}</h2>
            {d.events.map((e) => (
              <div key={e.key} className={c.event}>
                <span className={cx(c.stripe, c[e.layer])} aria-hidden />
                <div className={s.lines}>
                  <p className={s.t15sb}>{e.title}</p>
                  <p className={cx(s.t12, s.soft, c.wrapLine)}>{e.sub}</p>
                </div>
              </div>
            ))}
          </section>
        ))}
        {data.empty ? <EmptyState title="Nothing coming up" text={data.empty.text === "Nothing coming up in these layers." ? "No exams, deadlines or holidays ahead." : data.empty.text} /> : null}
        <Subscribe google={data.subscribe.google} personal={data.subscribe.personal} feed={feed} subscribed={subscribed} />
      </div>
    </Screen>
  );
}
