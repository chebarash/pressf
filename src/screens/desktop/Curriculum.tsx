import Link from "next/link";
import type { CurriculumView } from "@/server/views";
import { Chip } from "@/ui/components";
import * as adapt from "./adapt";
import x from "./lists.module.css";
import type { CurriculumData } from "./model";
import { css, cx, Empty, Pct, Tag } from "./parts";

const STATUS: Record<string, { label: string; tone: "accent" | "neutral" | "dark" }> = { passed: { label: "Passed", tone: "neutral" }, failed: { label: "Retake", tone: "dark" }, now: { label: "Now", tone: "accent" }, planned: { label: "Next", tone: "neutral" } };

/** Curriculum (G U) — the programme year by year, each semester as a card. */
export default function DesktopCurriculum({ data }: { data: CurriculumView }) {
  return <CurriculumScreen data={adapt.curriculum(data)} />;
}

export function CurriculumScreen({ data }: { data: CurriculumData }) {
  return (
    <main className={cx(css.screen, x.main)}>
      <header className={x.head}>
        <div>
          <h1 className={x.title}>{data.program}</h1>
          <p className={x.sub}>{data.line}</p>
        </div>
      </header>
      {data.programs.length > 1 && (
        <nav className={x.programs} aria-label="Programmes">
          {data.programs.map((p) => (
            <Chip key={p.id} size="s" label={p.name} href={p.href} selected={p.on} />
          ))}
        </nav>
      )}
      {data.years.length === 0 && <Empty title="No curriculum yet">Pick a programme to see its courses semester by semester.</Empty>}
      {data.years.map((y) => (
        <section key={y.label} className={x.year}>
          <h2 className={x.yearTitle}>{y.label}</h2>
          <div className={x.terms}>
            {y.semesters.map((s) => (
              <div key={s.label} className={cx(css.card, x.term)}>
                <p className={x.termHead}>
                  {s.label}
                  <span>{s.ects} ECTS</span>
                </p>
                <div data-nav-list>
                  {s.courses.map((c) => {
                    const body = (
                      <>
                        <span className={x.courseName}>
                          <b>{c.name}</b>
                          <span>{[c.code, c.ects != null && `${c.ects} ECTS`].filter(Boolean).join(" · ")}</span>
                        </span>
                        <Pct value={c.pct} />
                        {c.status && STATUS[c.status] ? <Tag tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Tag> : <span />}
                      </>
                    );
                    return c.href ? (
                      <Link key={c.code + c.name} href={c.href} className={x.course} data-nav-item>
                        {body}
                      </Link>
                    ) : (
                      <div key={c.code + c.name} className={x.course}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
