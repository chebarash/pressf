import Link from "next/link";
import { CourseCard, cx, EmptyState } from "@/ui/components";
import { ChevronRightIcon } from "@/ui/icons";
import b from "./parts/base.module.css";
import s from "./parts/Courses.module.css";
import type { MyCoursesView } from "./views";

/** Mobile My courses (Figma 4.1; 4.16 when the semester is not in the LMS yet). */
export default function Courses({ data }: { data: MyCoursesView }) {
  const next = data.next;
  // "5 courses · cohort selection 9–13 Feb"
  const nextLine = [next?.courses ? `${next.courses} ${next.courses === 1 ? "course" : "courses"}` : null, next?.selection ? `cohort selection ${next.selection}` : null].filter(Boolean).join(" · ");
  return (
    <div className={cx(b.screen, s.body)}>
      <h1 className={b.title}>My courses</h1>

      {data.notInLmsYet ? (
        <EmptyState className={b.emptyOneLine} title={`${data.term ?? "This semester"} isn't in LMS yet`} text="Courses appear here as soon as the registrar publishes your plan. Earlier semesters are below." />
      ) : (
        <div className={s.cards}>
          {data.courses.map((c) => (
            <CourseCard
              key={c.courseId}
              code={c.code}
              name={c.name}
              href={c.href}
              teacher={c.teacher ? { name: c.teacher.name, face: c.teacher.face } : undefined}
              line={c.when ?? undefined}
              recommend={c.recommendPct !== null ? { pct: c.recommendPct } : undefined}
            />
          ))}
        </div>
      )}

      <Link href="/next" className={b.nextStrip} prefetch>
        <span className={b.rowBody}>
          <span className={b.rowTitle}>{next?.term ? `Next: ${next.term}` : "Next semester"}</span>
          <span className={b.rowSub}>{nextLine || "Your study plan, cohorts and what students say"}</span>
        </span>
        <ChevronRightIcon size={18} />
      </Link>

      {data.earlier.length ? (
        <section className={s.earlier}>
          <h2 className={b.section}>Earlier</h2>
            {data.earlier.map((t) => (
              <Link key={t.term} href={`/progress?term=${encodeURIComponent(t.term)}`} className={b.row} prefetch>
                <span className={b.rowBody}>
                  <span className={b.rowTitle}>{t.term}</span>
                  <span className={b.rowSub}>
                    {t.courses} {t.courses === 1 ? "course" : "courses"}
                    {t.ects ? ` · ${t.ects} ECTS` : ""}
                  </span>
                </span>
                <ChevronRightIcon size={18} />
              </Link>
            ))}
        </section>
      ) : null}
    </div>
  );
}
