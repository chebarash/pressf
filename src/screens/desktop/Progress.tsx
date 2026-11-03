import Link from "next/link";
import { Fragment } from "react";
import type { ProgressView } from "@/server/views";
import * as adapt from "./adapt";
import type { ProgressData, ProgressRow } from "./model";
import { ButtonLink, css, cx, Empty, Hint } from "./parts";
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
      <h1 className={g.title}>Progress</h1>

      <section className={g.tiles}>
        {data.gpa && (
          <div className={cx(css.card, g.tile)}>
            <p className={g.tileLabel}>GPA</p>
            <p className={g.tileValue}>
              {data.gpa.value}
              <Spark values={data.gpa.trend} />
            </p>
            <p className={g.tileNote}>{data.gpa.delta ? <b>{data.gpa.delta}</b> : null} {data.gpa.note}</p>
          </div>
        )}
        {data.credits && (
          <div className={cx(css.card, g.tile)}>
            <p className={g.tileLabel}>Credits</p>
            <p className={g.tileValue}>
              {data.credits.done} / {data.credits.total}
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
            <p className={g.tileValue}>{data.attendance.value}</p>
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
            <div className={g.bars}>
              {data.semesters.map((s) => (
                <span key={s.term} className={cx(g.barCol, s.current && g.barNow)}>
                  <span className={g.barVal}>{s.value?.toFixed(2) ?? "—"}</span>
                  <span className={g.bar} style={{ height: s.value ? Math.max(12, (s.value - 2) * 40) : 12 }} />
                  {s.short}
                </span>
              ))}
            </div>
            {[...data.semesters]
              .filter((s) => !s.current)
              .reverse()
              .slice(0, 3)
              .map((s) => (
                <p key={s.term} className={g.semRow}>
                  <span>{s.term}</span>
                  <span>{s.line}</span>
                </p>
              ))}
          </div>
        )}
        {data.rate && (
          // Figma D6: the card itself is the way in ("press R to start"), no button.
          <Link href={data.rate.href} className={g.rate} data-key="r">
            <h2 className={g.rateTitle}>{data.rate.title}</h2>
            <p className={g.rateLine}>{data.rate.line}</p>
          </Link>
        )}
      </section>
    </main>
  );
}

export function ProgressTable({ rows, open }: { rows: ProgressRow[]; open: string | null }) {
  return (
    <section className={cx(css.card, g.table)} data-nav-list>
      <div className={g.headRow} role="row">
        <span>Course</span>
        <span>Average</span>
        <span>Rating</span>
        <span>Final</span>
        <span>Absences</span>
        <span>Next</span>
      </div>
      {rows.map((r, i) => (
        <Fragment key={r.id}>
          <Link href={r.href} className={cx(g.row, r.id === open && g.rowOn)} data-nav-item aria-current={r.id === open ? "page" : undefined}>
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
        </Fragment>
      ))}
    </section>
  );
}

const MARK: Record<string, string> = { High: g.markHigh, Low: g.markLow, None: g.markNone };

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
        <div className={g.dots}>
          {detail.classes.map((c, i) => (
            <span key={i} className={cx(g.dot, c === "qr" && g.dotQr, c === "absent" && g.dotAbsent)} title={c} />
          ))}
        </div>
        <p className={g.legend}>
          <span>
            <i style={{ border: "1.5px solid var(--border-strong)" }} />
            present
          </span>
          <span>
            <i style={{ background: "var(--bg-accent)" }} />
            via QR
          </span>
          <span>
            <i style={{ background: "var(--bg-danger)" }} />
            absent
          </span>
        </p>
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
