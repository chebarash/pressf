import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { CourseData } from "../fixtures/types";
import { ButtonLink, css, cx, Face, FileRow, Hint, Icon, MentionCard, RatingStrip, Score, Tag, TagStickers, Trend } from "../parts";
import c from "./course.module.css";
import { CourseList } from "./CourseList";

/** List · detail · inspector. The File screen swaps the inspector for the preview. */
export function CourseLayout({ data, aside }: { data: CourseData; aside?: ReactNode }) {
  const withList = !!data.myCourses?.length;
  return (
    <div className={cx(css.screen, c.layout, aside && withList && c.layoutFile, !withList && c.layoutNoList)}>
      {withList && <CourseList courses={data.myCourses!} terms={data.terms} current={data.code} />}
      <CourseDetail data={data} />
      {aside ?? <CourseInspector data={data} />}
    </div>
  );
}

function CourseDetail({ data }: { data: CourseData }) {
  return (
    <main className={c.detail}>
      <header className={c.head}>
        <div className={c.tags}>
          <Tag>{data.code}</Tag>
          {data.kind && <Tag tone="neutral">{data.kind}</Tag>}
        </div>
        <h1 className={c.name}>{data.name}</h1>
        <details className={c.termSwitch}>
          <summary>
            <Icon name="calendar" size={16} />
            {data.term.label}
            <Icon name="chevron-down" size={16} />
          </summary>
          <div className={c.termMenu}>
            {data.term.options.map((o) => (
              <Link key={o.href} href={o.href}>
                {o.label}
              </Link>
            ))}
          </div>
        </details>
        <RatingStrip strip={data.strip} />
      </header>

      <nav className={c.tabs} aria-label="Course sections">
        <span className={cx(c.tab, c.tabOn)} aria-current="page">
          {data.tabs.overview}
        </span>
        <Link href={data.tabs.filesHref} className={c.tab} data-key="g f">
          Files {data.tabs.files}
        </Link>
        <Link href={data.tabs.anonymousHref} className={c.tab}>
          Anonymous {data.tabs.anonymous}
        </Link>
      </nav>

      {data.weeks.length > 0 && (
        <section className={c.section}>
          <h2 className={c.sectionTitle}>Week by week</h2>
          {data.weeks.map((w) => (
            <Fragment key={w.n}>
              <div className={cx(c.week, w.current && c.weekNow)}>
                <span className={c.weekN}>{w.n}</span>
                <span className={c.weekTitle}>{w.title}</span>
                {w.current ? <Tag tone="dark">This week</Tag> : <Icon name="chevron-down" size={18} />}
              </div>
              {w.files.length > 0 && (
                <div className={cx(c.weekFiles, css.navList)} data-nav-list>
                  {w.files.map((f) => (
                    <FileRow key={f.id} file={f} hideCourse />
                  ))}
                </div>
              )}
            </Fragment>
          ))}
          <div className={c.links}>
            <Link href={data.tabs.filesHref} className={c.more}>
              All {data.weeksTotal} weeks <Icon name="chevron-right" size={18} />
            </Link>
            <Link href={data.tabs.filesHref} className={c.more}>
              All {data.filesTotal} files <Icon name="chevron-right" size={18} />
            </Link>
          </div>
        </section>
      )}

      {data.teachers.length > 0 && (
        <section className={c.section}>
          <h2 className={c.sectionTitle}>Who teaches it</h2>
          <div className={c.box}>
            {data.teachers.map((t) => (
              <Link key={t.id + t.line} href={t.href} className={c.boxRow}>
                <Face src={t.face} size={40} />
                <span className={c.boxText}>
                  <span className={c.boxTitle}>{t.name}</span>
                  <span className={c.boxMeta}>{t.line}</span>
                </span>
                {t.pressFPct != null && (
                  <span className={c.pressed}>
                    <b>{t.pressFPct}%</b>pressed F
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {(data.grading.length > 0 || data.syllabus.length > 0) && (
        <section className={c.section}>
          <h2 className={c.sectionTitle}>Syllabus</h2>
          <div className={c.box}>
            {data.grading.length > 0 && (
              <>
                <div className={c.boxRow}>
                  <span className={c.boxText}>
                    <span className={c.boxTitle}>Grading</span>
                    <span className={c.boxMeta}>From the course syllabus</span>
                  </span>
                  <Icon name="chevron-down" size={18} />
                </div>
                {data.grading.map((g) => (
                  <div key={g.title} className={c.assess}>
                    <span className={c.assessPct}>{g.pct}%</span>
                    <span className={c.boxText}>
                      <span className={c.assessTitle}>{g.title}</span>
                      <span className={c.assessNote}>{g.note}</span>
                    </span>
                  </div>
                ))}
              </>
            )}
            {data.syllabus.map((r) => {
              const body = (
                <>
                  <span className={c.boxText}>
                    <span className={c.boxTitle}>{r.title}</span>
                    <span className={c.boxMeta}>{r.meta}</span>
                  </span>
                  <Icon name="chevron-right" size={18} />
                </>
              );
              return r.href ? (
                <Link key={r.title} href={r.href} className={c.boxRow}>
                  {body}
                </Link>
              ) : (
                <div key={r.title} className={c.boxRow}>
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

function CourseInspector({ data }: { data: CourseData }) {
  const s = data.summary;
  return (
    <aside className={c.inspector} aria-label="About this course">
      {data.me && (
        <Link href={data.me.href} className={c.me}>
          <span className={c.meTop}>
            <Score value={data.me.average ?? "—"} tier={data.me.tier} />
            <span className={c.boxText}>
              <span className={c.boxTitle}>You in this course</span>
              <span className={c.boxMeta}>{data.me.line}</span>
            </span>
            <Icon name="chevron-right" size={18} />
          </span>
          {data.me.next && <span className={c.meNext}>{data.me.next}</span>}
        </Link>
      )}

      {s ? (
        <div className={c.summary}>
          <p className={c.by}>{s.by}</p>
          <div className={c.numbers}>
            <span className={c.number}>
              <b style={{ color: "var(--text-accent)" }}>{s.recommendPct}%</b>
              <span>recommend</span>
            </span>
            {s.hours != null && (
              <span className={c.number}>
                <b>{Math.round(s.hours)} h</b>
                <span>a week</span>
              </span>
            )}
            {s.difficulty != null && (
              <span className={c.number}>
                <b style={{ color: "var(--rating-low)" }}>{Math.round(s.difficulty)}/5</b>
                <span>hard</span>
              </span>
            )}
          </div>
          {s.trend.length > 1 && (
            <div>
              <p className={c.trendHead}>
                <span>Recommend by semester</span>
                {s.delta && <span className={c.delta}>{s.delta}</span>}
              </p>
              <Trend points={s.trend} />
            </div>
          )}
          {s.tags.length > 0 && <TagStickers tags={s.tags} />}
        </div>
      ) : (
        <div className={c.summary}>
          <p className={c.by}>Not enough ratings yet</p>
          <p className={c.boxMeta}>Ratings show from 5 students.</p>
        </div>
      )}

      {data.mention && (
        <>
          <h2 className={c.bandTitle}>What Anonymous says</h2>
          <MentionCard m={data.mention} />
        </>
      )}

      {data.rateHref && (
        <div className={c.rate}>
          <ButtonLink href={data.rateHref} data-key="r">
            Rate this course
          </ButtonLink>
          <Hint>R</Hint>
        </div>
      )}
    </aside>
  );
}
