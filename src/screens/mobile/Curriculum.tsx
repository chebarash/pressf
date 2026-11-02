import Link from "next/link";
import type { CurriculumView } from "@/server/views";
import { EmptyState, Tag } from "./mc/kit";
import { MainButton, Sheet } from "./mc/client";
import { cx, Screen } from "./mc/parts";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";

const STATUS: Record<string, string> = { passed: "Passed", failed: "Not passed", now: "This semester", planned: "Planned" };

/**
 * Mobile Curriculum (Figma 7.6): years as tabs, terms as boards; a course opens a
 * sheet. `year` and `course` come from the URL (?year=&course=), `base` is the page path.
 */
export default function Curriculum({ data, base, year, course }: { data: CurriculumView; base: string; year?: number | null; course?: string | null }) {
  const current = data.years.find((y) => y.year === year) ?? data.years[0] ?? null;
  const yearHref = (y: number) => `${base}?year=${y}`;
  const tileHref = (id: string) => `${base}?year=${current?.year ?? 1}&course=${encodeURIComponent(id)}`;
  const sel = course ? current?.terms.flatMap((t) => t.courses).find((k) => k.courseId === course) ?? null : null;
  return (
    <Screen>
      <div className={s.body} style={{ gap: 0 }}>
        <div className={c.block8} style={{ paddingBottom: 16 }}>
          <h1 className={cx(s.title, "t-mobile-title")}>Curriculum</h1>
          {data.program ? <p className={cx(s.p0, "t-label-md", s.soft)}>{data.program.name}</p> : null}
        </div>
        {data.years.length > 1 ? (
          <nav className={c.tabs} aria-label="Year">
            {data.years.map((y) => (
              <Link key={y.year} href={yearHref(y.year)} replace scroll={false} className={cx(c.tab, y.year === current?.year && c.tabActive)} aria-current={y.year === current?.year ? "page" : undefined}>
                Year {y.year}
              </Link>
            ))}
          </nav>
        ) : null}
        {current ? (
          <div className={c.board}>
            {current.terms.map((t) => (
              <section key={t.semesterId} className={c.term}>
                <h2>{t.label}</h2>
                <div className={c.tiles}>
                  {t.courses.map((k) => (
                    <Link
                      key={k.courseId}
                      href={tileHref(k.courseId)}
                      replace
                      scroll={false}
                      className={cx(c.tile, s.pressable, k.status === "now" && c.tileMine, sel?.courseId === k.courseId && c.tileSelected)}
                      aria-current={sel?.courseId === k.courseId ? "true" : undefined}
                    >
                      <p className={c.tileTop}>
                        <span>{k.code ?? ""}</span>
                        <span>{k.ects ? `${k.ects} ECTS` : ""}</span>
                      </p>
                      <p className={c.tileName}>{k.name}</p>
                      <p className={c.tileStats}>{[k.recommendPct !== null ? `${k.recommendPct}% recommend` : null, k.status ? STATUS[k.status] : null].filter(Boolean).join(" · ")}</p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState title="Not filled in yet" text="A program's plan fills in as its students sign in to Press F." />
        )}
        {data.programs.length && !data.program ? (
          <div className={c.block8}>
            {data.programs.map((p) => (
              <Link key={p.id} href={`/programs/${p.id}/curriculum`} className={c.browse}>
                <span>{p.name}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      {sel ? (
        <Sheet closeHref={current ? yearHref(current.year) : base} title={sel.name} heading={false} className={c.curSheet} footer={sel.href ? <MainButton inline text={`Open ${sel.name}`} href={sel.href} /> : null}>
          <div className={c.block8} style={{ gap: 4, alignItems: "flex-start" }}>
            {sel.code ? <Tag tone="accent">{sel.code}</Tag> : null}
            <h2 className={cx(s.section, "t-mobile-section")}>{sel.name}</h2>
          </div>
          <p className={cx(s.p0, s.t13, s.soft)}>
            {[sel.ects ? `${sel.ects} ECTS` : null, sel.recommendPct !== null ? `${sel.recommendPct}% recommend` : null, sel.status ? STATUS[sel.status] : null].filter(Boolean).join(" · ") || "No details yet"}
          </p>
        </Sheet>
      ) : null}
    </Screen>
  );
}
