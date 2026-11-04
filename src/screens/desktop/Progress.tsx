import Link from "next/link";
import type { ProgressView } from "@/server/views";
import * as adapt from "./adapt";
import type { ClassState, ProgressData, ProgressRow } from "./model";
import { css, cx, Empty, Hint, Icon } from "./parts";
import { SortableRows, type SortableColumn } from "@/ui/table/Sort";
import { CountUp } from "@/ui/components/CountUp";
import { ScreenHint } from "@/ui/shell/Hints";
import { PageHead } from "@/ui/shell/PageHeader";
import g from "./progress.module.css";

/** D6 Progress — tiles, one table for every course (J/K, Enter opens), GPA by semester, rating nudge. */
export default function DesktopProgress({ data }: { data: ProgressView }) {
  return <ProgressScreen data={adapt.progress(data)} />;
}

const absColor = (left: number, max: number) => (left <= 2 ? "var(--bg-danger)" : left / max < 0.5 ? "var(--mustard-500)" : "var(--bg-accent)");
const num = (n: number | null) => (n == null ? <span className={g.dash}>—</span> : <span className={g.num}>{n}</span>);

export function ProgressScreen({ data }: { data: ProgressData }) {
  return (
    <main data-desktop-screen className={cx(css.screen, g.main)}>
      <PageHead title="Progress" />
      <ScreenHint screen="progress" ctx={{ desktop: true }} />

      <section className={g.tiles}>
        {data.gpa && (
          <div className={cx(css.card, g.tile)}>
            <p className={g.tileLabel}>GPA</p>
            <p className={g.tileValue}>
              <CountUp value={String(data.gpa.value)} id="gpa" />
              <Spark values={data.gpa.trend} />
            </p>
            <p className={g.tileNote}>{data.gpa.delta ? <b>{data.gpa.delta}</b> : null} {data.gpa.note}</p>
          </div>
        )}
        {data.credits && (
          <div className={cx(css.card, g.tile)}>
            <p className={g.tileLabel}>Credits</p>
            <p className={g.tileValue}>
              <CountUp value={String(data.credits.done)} id="credits" /> / {data.credits.total}
            </p>
            <div className={g.track}>
              <div className={g.fill} style={{ width: `${Math.min(100, (data.credits.done / data.credits.total) * 100)}%` }} />
            </div>
            <p className={g.tileNote}>{data.credits.note}</p>
          </div>
        )}
        {data.attendance && (
          <div className={cx(css.card, g.tile)}>
            <p className={g.tileLabel}>Attendance</p>
            <p className={g.tileValue}><CountUp value={String(data.attendance.value)} id="attendance" /></p>
            <p className={cx(g.tileNote, data.attendance.low && g.tileLow)}>{data.attendance.note}</p>
          </div>
        )}
        {data.week && (
          <div className={cx(css.card, g.tile, g.week)}>
            <p className={g.tileLabel}>This week</p>
            <p className={cx(g.tileValue, g.tileValueSm)}>{data.week.title}</p>
            <p className={g.tileNote}>{data.week.note}</p>
          </div>
        )}
      </section>

      {data.empty && data.rows.length === 0 ? (
        <Empty title="No marks yet">Marks, absences and deadlines show up here once the LMS has them.</Empty>
      ) : (
        <ProgressTable rows={data.rows} open={data.open} />
      )}

      <section className={g.bottom}>
        {data.semesters.length > 0 && (
          <div className={cx(css.card, g.semesters)}>
            <h2 className={g.cardTitle}>GPA by semester</h2>
            {data.semesters.some((s) => s.value != null) ? (
              <div className={g.bars}>
                {data.semesters.map((s, i) => (
                  <span key={`${s.term}-${i}`} className={cx(g.barCol, s.current && g.barNow, s.value == null && g.barEmpty)} title={s.value == null ? `${s.term}: no GPA yet` : `${s.term}: GPA ${s.value.toFixed(2)}`}>
                    <span className={g.barVal}>{s.value?.toFixed(2) ?? "—"}</span>
                    <span className={g.bar} style={{ height: s.value ? Math.max(12, (s.value - 2) * 40) : 12 }} />
                    {s.short}
                  </span>
                ))}
              </div>
            ) : (
              <p className={g.detailEmpty}>No semester GPA from the LMS yet. It shows here once final grades are published.</p>
            )}
            {[...data.semesters]
              .filter((s) => !s.current)
              .reverse()
              .slice(0, 3)
              .map((s) =>
                s.href ? (
                  // Opens that semester's results (5.6 layout), which links on to the curriculum.
                  <Link prefetch key={`${s.term}-${s.href}`} href={s.href} className={cx(g.semRow, g.semLink)}>
                    <span>{s.term}</span>
                    <span>
                      {s.line} <Icon name="chevron-right" size={14} />
                    </span>
                  </Link>
                ) : (
                  <p key={s.term} className={g.semRow}>
                    <span>{s.term}</span>
                    <span>{s.line}</span>
                  </p>
                ),
              )}
          </div>
        )}
        {data.rate && (
          // Figma D6: the card itself is the way in ("press R to start"), no button.
          <Link prefetch href={data.rate.href} className={g.rate} data-key="r">
            <h2 className={g.rateTitle}>{data.rate.title}</h2>
            <p className={g.rateLine}>{data.rate.line}</p>
          </Link>
        )}
      </section>
    </main>
  );
}

const PROGRESS_COLUMNS: SortableColumn<"course" | "average" | "rating" | "final" | "absences" | "next">[] = [
  { key: "course", label: "Course" },
  { key: "average", label: "Average" },
  { key: "rating", label: "Rating" },
  { key: "final", label: "Final" },
  { key: "absences", label: "Absences" },
  { key: "next", label: "Next" },
];

export function ProgressTable({ rows, open, sortable = true }: { rows: ProgressRow[]; open: string | null; sortable?: boolean }) {
  return (
    <section className={cx(css.card, g.table)} data-nav-list>
      <SortableRows
        headClassName={g.headRow}
        columns={PROGRESS_COLUMNS}
        sortable={sortable && rows.length > 1}
        rows={rows.map((r) => ({
          id: r.id,
          values: { course: r.name, average: r.average, rating: r.rating, final: r.final, absences: r.absences?.used, next: r.nextAt ? Date.parse(r.nextAt) : null },
          node: <ProgressRowView r={r} open={open} />,
        }))}
      />
    </section>
  );
}

function ProgressRowView({ r, open }: { r: ProgressRow; open: string | null }) {
  return (
    <>
      <Link prefetch href={r.href} className={cx(g.row, r.id === open && g.rowOn)} data-nav-item aria-current={r.id === open ? "page" : undefined}>
        <span className={g.course}>
          <span className={g.courseName}>{r.name}</span>
          <span className={g.courseMeta}>{r.meta}</span>
        </span>
        {num(r.average)}
        {num(r.rating)}
        {num(r.final)}
        {r.absences ? (
          <span className={g.abs}>
            <span className={g.absTop}>
              <span>
                {r.absences.used} of {r.absences.max}
              </span>
              <b>{r.absences.left} left</b>
            </span>
            <span className={g.absTrack}>
              <span className={g.absFill} style={{ display: "block", width: `${Math.min(100, (r.absences.used / Math.max(1, r.absences.max)) * 100)}%`, background: absColor(r.absences.left, r.absences.max) }} />
            </span>
          </span>
        ) : (
          <span className={g.dash}>—</span>
        )}
        <span className={g.next}>{r.next ?? "—"}</span>
      </Link>
      {r.detail && <CourseDetail detail={r.detail} />}
    </>
  );
}

const MARK: Record<string, string> = { High: g.markHigh, Low: g.markLow, None: g.markNone };

/** Figma D6 dots: attended (QR or teacher) moss green, late mustard, absent rust, excused a soft ring, not marked a dashed ring. */
export const DOT: Record<ClassState, string> = { attended: g.dotAttended, late: g.dotLate, absent: g.dotAbsent, excused: g.dotExcused, unmarked: g.dotUnmarked };
const LEGEND: Array<[ClassState, string]> = [
  ["attended", "attended"],
  ["late", "late"],
  ["absent", "absent"],
  ["excused", "excused"],
  ["unmarked", "not marked"],
];

/** Legend for the states that occur (attended and absent always, as in Figma). */
export function ClassLegend({ states, counts }: { states: ClassState[]; counts?: Record<ClassState, number> }) {
  const show = LEGEND.filter(([s]) => s === "attended" || s === "absent" || states.includes(s));
  return (
    <p className={g.legend}>
      {show.map(([s, label]) => (
        <span key={s}>
          <i className={cx(g.legendDot, DOT[s])} />
          {counts ? `${counts[s]} ${label}` : label}
        </span>
      ))}
    </p>
  );
}

function CourseDetail({ detail }: { detail: NonNullable<ProgressRow["detail"]> }) {
  return (
    <div className={g.detail}>
      <div>
        <p className={g.detailLabel}>Marks so far</p>
        <div className={g.marks}>
          {detail.marks.map((m) => (
            <span key={m.label} className={g.mark}>
              <span className={g.markVal}>{m.value == null ? "—" : `${m.value}`}</span>
              <span className={cx(g.markBar, MARK[m.tier])} style={{ height: m.value == null ? 38 : Math.max(10, (m.value / m.max) * 38) }} />
              {m.label}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className={g.detailLabel}>{detail.classesLabel}</p>
        {detail.classes.length > 0 ? (
          <>
            <ul className={g.dots} aria-label="Attendance, oldest class first">
              {detail.classes.map((c, i) => (
                <li key={i} className={cx(g.dot, DOT[c.state])} title={c.title} aria-label={c.title} />
              ))}
            </ul>
            <ClassLegend states={[...new Set(detail.classes.map((c) => c.state))]} />
          </>
        ) : (
          <p className={g.detailEmpty}>No classes in the gradebook yet.</p>
        )}
      </div>
      <div>
        {detail.grading.length > 0 && (
          <>
            <p className={g.detailLabel}>Grading (syllabus)</p>
            <div className={g.grading}>
              {detail.grading.map((x) => (
                <p key={x.label} className={g.gradingRow}>
                  <span>{x.label}</span>
                  <span>{x.value}</span>
                </p>
              ))}
            </div>
          </>
        )}
        <p className={g.detailLabel}>
          <Hint>J</Hint> <Hint>K</Hint> move between courses
        </p>
      </div>
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 116 + 2},${26 - ((v - lo) / (hi - lo || 1)) * 22}`).join(" ");
  return (
    <svg className={g.spark} viewBox="0 0 120 28" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--bg-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
