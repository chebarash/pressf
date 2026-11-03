import Link from "next/link";
import { CourseCard, cx, Face } from "@/ui/components";
import { ChevronRightIcon } from "@/ui/icons";
import b from "./parts/base.module.css";
import s from "./parts/Courses.module.css";
import type { MyCoursesView } from "./views";

/** Mobile My courses (Figma 4.1; 4.16 when the semester is not in the LMS yet). */
export default function Courses({ data }: { data: MyCoursesView }) {
  return (
    <div className={cx(b.screen, b.noButton)}>
      <header className={b.head}>
        <h1 className={b.title}>My courses</h1>
      </header>

      {data.notInLmsYet ? (
        <div className={b.empty}>
          <Face kind="mascot" size={96} priority />
          <h2 className={b.emptyTitle}>{data.term ?? "This semester"} isn&apos;t in LMS yet</h2>
          <p className={b.emptyText}>Courses appear here as soon as the registrar publishes your plan. Earlier semesters are below.</p>
        </div>
      ) : (
        <div className={cx(b.stack, s.cards)}>
          {data.courses.map((c) => (
            <CourseCard
              key={c.courseId}
              code={c.code}
              name={c.name}
              href={c.href}
              teacher={c.teacher ? { name: c.teacher.name } : undefined}
              line={c.when ?? undefined}
              recommend={c.recommendPct !== null ? { pct: c.recommendPct } : undefined}
            />
          ))}
        </div>
      )}

      <Link href="/next" className={cx(b.nextStrip, s.next)} prefetch>
        <span className={b.rowBody}>
          <span className={b.rowTitle}>Next semester</span>
          <span className={b.rowSub}>Your study plan, cohorts and what students say</span>
        </span>
        <ChevronRightIcon size={20} />
      </Link>

      {data.earlier.length ? (
        <section className={s.earlier}>
          <h2 className={b.section}>Earlier</h2>
          <div className={b.stack}>
            {data.earlier.map((t) => (
              <Link key={t.term} href={`/progress?term=${encodeURIComponent(t.term)}`} className={b.row} prefetch>
                <span className={b.rowBody}>
                  <span className={b.rowTitle}>{t.term}</span>
                  <span className={b.rowSub}>
                    {t.courses} {t.courses === 1 ? "course" : "courses"}
                    {t.ects ? ` · ${t.ects} ECTS` : ""}
                  </span>
                </span>
                <ChevronRightIcon size={20} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
