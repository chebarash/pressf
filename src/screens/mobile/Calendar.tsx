import type { CalendarView } from "@/server/views";
import { Subscribe } from "./mc/CalendarView";
import { Chip, EmptyState } from "./mc/kit";
import { cx, Screen } from "./mc/parts";
import { toggleLayerHref, type CalLayer } from "./mc/format";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";

const NOUN: Record<CalLayer, string> = { classes: "classes", exams: "exams", deadlines: "deadlines", holidays: "holidays", registration: "registration windows" };

/** Mobile Calendar (Figma 6.1, 6.2 nothing in these layers, 6.3 added to phone). Layers live in ?layers=. */
export default function Calendar({ data }: { data: CalendarView }) {
  const on = data.layers.filter((l) => l.on).map((l) => l.id);
  return (
    <Screen>
      <div className={cx(s.body, s.gap16)} style={{ paddingBottom: 32 }}>
        <h1 className={cx(s.title, "t-mobile-title")}>Calendar</h1>
        <nav className={c.layers} aria-label="Layers">
          {data.layers.map((l) => (
            <Chip key={l.id} label={l.label} selected={l.on} href={toggleLayerHref(on, l.id)} />
          ))}
        </nav>
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
        {data.empty ? (
          <EmptyState
            title={on.length === 1 ? `No ${NOUN[on[0]]} this month` : on.length ? "Nothing in these layers" : "Pick a layer"}
            text={`${data.empty.text === "Nothing coming up in these layers." ? "" : `${data.empty.text} `}Turn other layers back on to see classes and exams.`}
          />
        ) : null}
        <Subscribe href={data.icsHref} />
      </div>
    </Screen>
  );
}
