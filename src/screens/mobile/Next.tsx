import { CourseCard, cx, Face } from "@/ui/components";
import b from "./parts/base.module.css";
import { CohortSheet } from "./parts/CohortSheet";
import s from "./parts/Next.module.css";
import type { NextCourse, NextScreen } from "./views";

const NEEDS: Record<string, string> = { passed: "passed ✓", "in-progress": "in progress", missing: "not passed yet" };

const needsLine = (c: NextCourse) =>
  c.prerequisites.length ? `Needs ${c.prerequisites.map((p) => `${p.text}${p.status ? ` · ${NEEDS[p.status]}` : ""}`).join(", ")}` : "No prerequisites";

const cohortLine = (c: NextCourse) =>
  c.cohorts.length === 0 ? "Cohorts not published yet" : c.cohorts.length === 1 ? `1 cohort · ${c.cohorts[0].name}` : `${c.cohorts.length} cohorts · pick one`;

const loadLine = (c: NextCourse) => {
  const r = c.ratings?.enough ? c.ratings : null;
  return [r?.hoursLabel, r?.difficultyLabel, !r && c.ects ? `${c.ects} ECTS` : null].filter(Boolean).join(" · ") || "Not rated yet";
};

/** Mobile Next semester (Figma 4.14) with the cohort sheet (4.15) on /next/[code]. */
export default function Next({ data }: { data: NextScreen }) {
  const open = data.open ? data.courses.find((c) => c.code === data.open) ?? null : null;
  if (!data.term) {
    return (
      <div className={cx(b.screen, b.noButton)}>
        <header className={b.head}>
          <p className={b.eyebrow}>Next semester</p>
          <h1 className={b.title}>Not planned yet</h1>
        </header>
        <div className={b.empty}>
          <Face kind="mascot" size={96} priority />
          <p className={b.emptyText}>{data.missing ? "We haven't found your study plan yet. It appears after your next sign-in with LMS." : "Your study plan has no further semesters."}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={cx(b.screen, !open && b.noButton)}>
      <header className={b.head}>
        <p className={b.eyebrow}>Next semester</p>
        <h1 className={b.title}>{data.term}</h1>
        <p className={b.sub}>
          From your study plan · {data.courses.length} {data.courses.length === 1 ? "course" : "courses"}
          {data.ects ? ` · ${data.ects} ECTS` : ""}
        </p>
      </header>

      {data.phases.length ? (
        <dl className={s.dates}>
          {data.phases.map((d) => (
            <div key={`${d.title}${d.starts}`} className={s.date}>
              <dt>{d.label}</dt>
              <dd>{d.title}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className={s.list}>
        {data.courses.map((c) => (
          <div key={c.courseId} className={s.item}>
            <CourseCard
              code={c.code ?? "—"}
              name={c.name}
              href={c.code ? `/next/${c.code}` : undefined}
              teacher={{ name: cohortLine(c) }}
              line={loadLine(c)}
              recommend={c.recommendPct !== null ? { pct: c.recommendPct } : undefined}
            />
            <p className={s.needs}>{needsLine(c)}</p>
          </div>
        ))}
      </div>
      <p className={b.small}>Plan from LMS. Ratings and hours from students who took each course.</p>

      {open ? <CohortSheet course={open} /> : null}
    </div>
  );
}
