import { cx, Skeleton } from "@/ui/components";
import b from "./parts/base.module.css";
import c from "./parts/Course.module.css";
import t from "./parts/Timetable.module.css";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

/** Figma 3.7 Timetable · loading: the frame paints, classes arrive. */
export function TimetableLoading() {
  return (
    <div className={cx(b.screen, b.noButton)} role="status" aria-label="Loading timetable">
      <header className={b.head}>
        <h1 className={b.title}>Timetable</h1>
        <Skeleton width={160} height={16} />
      </header>
      <div className={t.tabs} aria-hidden>
        {DAYS.map((d) => (
          <span key={d} className={t.tab}>
            {d}
          </span>
        ))}
      </div>
      <div className={t.list}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={t.skeleton} />
        ))}
      </div>
    </div>
  );
}

/** Figma 4.17 Course · loading: header and tabs first, week blocks as placeholders. */
export function CourseLoading() {
  return (
    <div className={cx(b.screen, b.noButton)} role="status" aria-label="Loading course">
      <header className={c.header}>
        <div className={c.tags}>
          <Skeleton width={72} height={24} />
          <Skeleton width={48} height={24} />
        </div>
        <Skeleton width={220} height={56} radius="md" />
        <Skeleton width={160} height={39} radius="full" />
      </header>
      <div className={c.tabs} aria-hidden>
        <span className={cx(c.tab, c.tabOn)}>Overview</span>
        <span className={c.tab}>Files</span>
        <span className={c.tab}>Anonymous</span>
      </div>
      <div className={c.content}>
        <span className={c.skeleton} style={{ height: 127 }} />
        <section className={c.weeks}>
          <h2 className={b.section}>Week by week</h2>
          <span className={c.skeleton} style={{ height: 46 }} />
          <span className={c.skeleton} style={{ height: 52 }} />
        </section>
      </div>
    </div>
  );
}
