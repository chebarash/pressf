import Link from "next/link";
import type { CourseProgressView } from "@/server/views";
import * as adapt from "./adapt";
import type { ClassState, CourseProgressData } from "./model";
import { css, cx, Icon } from "./parts";
import { ClassLegend, DOT, ProgressTable } from "./Progress";
import g from "./progress.module.css";

/** D6 opened on one course: its row with marks, the attendance dots, and every class with how it was marked. */
export default function DesktopCourseProgress({ data }: { data: CourseProgressView }) {
  return <CourseProgressScreen data={adapt.courseProgress(data)} />;
}

const STATE_TONE: Partial<Record<ClassState, string>> = { attended: g.stateAttended, absent: g.stateAbsent, excused: g.stateUnmarked, unmarked: g.stateUnmarked };

export function CourseProgressScreen({ data }: { data: CourseProgressData }) {
  const states = (Object.keys(data.counts) as ClassState[]).filter((s) => data.counts[s] > 0);
  return (
    <main data-desktop-screen className={cx(css.screen, g.main)}>
      <Link prefetch href="/progress" className={g.back} data-key="Escape">
        <Icon name="chevron-left" size={14} /> Progress
      </Link>
      <h1 className={g.title}>{data.course.name}</h1>
      <p className={g.sub}>{[data.course.code, data.course.term, data.course.teacher].filter(Boolean).join(" · ")}</p>
      <ProgressTable rows={[{ ...data.row, href: data.course.href }]} open={data.row.id} />

      <section className={cx(css.card, g.classes)} aria-label="Class by class">
        <div className={g.classesHead}>
          <h2 className={g.cardTitle}>Class by class</h2>
          {data.classes.length > 0 && <ClassLegend states={states} counts={data.counts} />}
        </div>
        {data.classes.length === 0 ? (
          <p className={cx(g.detailEmpty, g.classesEmpty)}>No classes in the LMS gradebook yet. Each class shows here once it is held, with how you were marked.</p>
        ) : (
          <ul className={g.classList}>
            {data.classes.map((c) => (
              <li key={c.key} className={g.classRow}>
                <span className={g.classDate}>{c.date ?? "—"}</span>
                <span className={g.classLesson}>{c.lesson}</span>
                <span className={g.classKind}>{c.kind}</span>
                <span className={cx(g.classState, STATE_TONE[c.state])}>
                  <span className={cx(g.dot, DOT[c.state])} aria-hidden />
                  {adapt.CLASS_STATE_LABEL[c.state]}
                </span>
                <span className={g.classScore}>{c.score ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
