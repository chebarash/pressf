import Link from "next/link";
import type { TermResultsView } from "@/server/views";
import * as adapt from "./adapt";
import type { TermResultsData } from "./model";
import { css, cx, Empty, Icon } from "./parts";
import g from "./progress.module.css";
import { SortableRows, type SortableColumn } from "@/ui/table/Sort";

/** D6 for an earlier semester: the 5.6 results laid out like Progress (tiles, one table, bottom cards). */
export default function DesktopProgressTerm({ data }: { data: TermResultsView }) {
  return <ProgressTermScreen data={adapt.termResults(data)} />;
}

const MARK: Record<string, string> = { High: g.finalHigh, Mid: g.finalMid, Low: g.finalLow, None: g.finalNone };
const TONE: Record<string, string | undefined> = { ok: g.statusOk, low: g.statusLow, none: undefined };
/** Status sorts passed, then not passed; no status last. */
const STATUS_RANK: Record<string, number | null> = { ok: 0, low: 1, none: null };
const TERM_COLUMNS: SortableColumn<"course" | "final" | "status" | "ects">[] = [
  { key: "course", label: "Course" },
  { key: "final", label: "Final" },
  { key: "status", label: "Status" },
  { key: "ects", label: "ECTS" },
];

export function ProgressTermScreen({ data }: { data: TermResultsData }) {
  return (
    <main data-desktop-screen className={cx(css.screen, g.main)}>
      <Link href="/progress" className={g.back} data-key="Escape">
        <Icon name="chevron-left" size={14} /> Progress
      </Link>
      <h1 className={g.title}>{data.title}</h1>
      <p className={g.sub}>{data.sub}</p>

      {data.tiles.length > 0 && (
        <section className={g.tiles}>
          {data.tiles.map((t) => (
            <div key={t.label} className={cx(css.card, g.tile)}>
              <p className={g.tileLabel}>{t.label}</p>
              <p className={g.tileValue}>{t.value}</p>
              <p className={g.tileNote}>{t.note}</p>
            </div>
          ))}
        </section>
      )}

      {data.rows.length === 0 ? (
        <Empty title="No courses here">The LMS has no courses recorded for this semester.</Empty>
      ) : (
        <section className={cx(css.card, g.table)} data-nav-list>
          <SortableRows
            headClassName={cx(g.headRow, g.termCols)}
            columns={TERM_COLUMNS}
            rows={data.rows.map((r) => {
            const cells = (
              <>
                <span className={g.course}>
                  <span className={g.courseName}>{r.name}</span>
                  {r.meta ? <span className={g.courseMeta}>{r.meta}</span> : null}
                </span>
                <span className={cx(g.final, MARK[r.tier])}>{r.final ?? "—"}</span>
                <span className={cx(g.status, TONE[r.statusTone])}>{r.status}</span>
                {r.ects == null ? <span className={g.dash}>—</span> : <span className={g.num}>{r.ects}</span>}
              </>
            );
            const node = r.href ? (
              <Link href={r.href} className={cx(g.row, g.termCols)} data-nav-item>
                {cells}
              </Link>
            ) : (
              <div className={cx(g.row, g.termCols, g.rowStatic)}>{cells}</div>
            );
            return { id: r.id, values: { course: r.name, final: r.final, status: STATUS_RANK[r.statusTone], ects: r.ects }, node };
          })}
          />
        </section>
      )}

      <section className={cx(g.bottom, !data.rate && g.bottomOne)}>
        <Link href={data.curriculum.href} className={cx(css.card, g.semesters, g.curriculum)} data-key="c">
          <span className={g.curriculumText}>
            <h2 className={g.cardTitle}>{data.curriculum.title}</h2>
            <span className={g.rateLine}>{data.curriculum.line}</span>
          </span>
          <Icon name="chevron-right" size={18} />
        </Link>
        {data.rate && (
          <Link href={data.rate.href} className={g.rate} data-key="r">
            <h2 className={g.rateTitle}>{data.rate.title}</h2>
            <p className={g.rateLine}>{data.rate.line}</p>
          </Link>
        )}
      </section>
    </main>
  );
}
