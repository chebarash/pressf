import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { CourseData } from "../model";
import { RatingSummary } from "@/ui/components";
import { Button, ButtonLink, css, cx, Empty, Face, FileRow, Hint, Icon, KeyTo, MentionCard, RatingStrip, Score, Tag } from "../parts";
import c from "./course.module.css";
import { CourseFiles } from "./CourseFiles";
import { CourseList } from "./CourseList";

export type CourseTab = "overview" | "files" | "anonymous";

/** List · detail · inspector. The File screen swaps the inspector for the preview. */
export function CourseLayout({ data, aside, tab = "overview" }: { data: CourseData; aside?: ReactNode; tab?: CourseTab }) {
  const withList = !!data.myCourses;
  return (
    <div data-desktop-screen className={cx(css.screen, c.layout, !!aside && withList && c.layoutFile, !withList && c.layoutNoList)}>
      {withList && <CourseList courses={data.myCourses!} terms={data.terms} current={data.code} />}
      <CourseDetail data={data} tab={tab} />
      {aside ?? <CourseInspector data={data} />}
    </div>
  );
}

/** Figma 4.8: nothing uploaded yet. */
const NoFiles = () => <Empty title="No files yet">Files show up here as soon as teachers upload them to LMS. We check every few hours.</Empty>;

function CourseDetail({ data, tab }: { data: CourseData; tab: CourseTab }) {
  // Tabs keep the semester (?term=) and the list pane's semester (?list=).
  const keep = (href: string) => {
    const q = data.tabQuery ?? "";
    return q ? `${href}${href.includes("?") ? "&" : "?"}${q}` : href;
  };
  const overviewHref = keep(`/c/${encodeURIComponent(data.code)}`);
  return (
    <main className={c.detail}>
      <header className={c.head}>
        <div className={c.tags}>
          <Tag>{data.code}</Tag>
          {data.kind && <Tag tone="neutral">{data.kind}</Tag>}
        </div>
        <h1 className={c.name}>{data.name}</h1>
        {data.context ? (
          <Link href={`/c/${data.code}`} className={c.more}>
            Open the course <Icon name="chevron-right" size={18} />
          </Link>
        ) : (
          <>
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
          </>
        )}
      </header>

      {!data.context && (
      <nav className={c.tabs} aria-label="Course sections">
        <Link href={overviewHref} prefetch scroll={false} className={cx(c.tab, tab === "overview" && c.tabOn)} aria-current={tab === "overview" ? "page" : undefined}>
          {data.tabs.overview}
        </Link>
        {!data.locked && (
          <KeyTo k="g f">
            <Link href={keep(data.tabs.filesHref)} prefetch scroll={false} className={cx(c.tab, tab === "files" && c.tabOn)} aria-current={tab === "files" ? "page" : undefined}>
              Files {data.tabs.files || ""}
            </Link>
          </KeyTo>
        )}
        <Link href={keep(data.tabs.anonymousHref)} prefetch scroll={false} className={cx(c.tab, tab === "anonymous" && c.tabOn)} aria-current={tab === "anonymous" ? "page" : undefined}>
          Anonymous {data.tabs.anonymous}
        </Link>
      </nav>
      )}

      {data.locked && <p className={c.boxMeta}>Sign in to see the weeks, files and your marks for this course.</p>}

      {tab === "files" && !data.context ? (
        data.files?.length ? <CourseFiles files={data.files} topics={data.topics ?? {}} /> : <NoFiles />
      ) : tab === "anonymous" && !data.context ? (
        <CoursePosts data={data} />
      ) : (
        <Overview data={data} keep={keep} />
      )}
    </main>
  );
}

function CoursePosts({ data }: { data: CourseData }) {
  const posts = data.posts ?? [];
  if (!posts.length) return <Empty title="Quiet so far">{`Posts in the students' Anonymous channel that mention ${data.name} show up here.`}</Empty>;
  return (
    <section className={c.section}>
      <p className={c.boxMeta}>
        {data.tabs.anonymous} {data.tabs.anonymous === 1 ? "post mentions" : "posts mention"} {data.name}
      </p>
      <div className={c.posts}>
        {posts.map((m) => (
          <MentionCard key={m.href} m={m} />
        ))}
      </div>
    </section>
  );
}

function Overview({ data, keep }: { data: CourseData; keep: (href: string) => string }) {
  const other = data.otherFiles ?? [];
  const empty = !data.locked && !data.context && data.weeks.length === 0 && other.length === 0;
  return (
    <>
      {empty && (
        <section className={c.section}>
          <h2 className={c.sectionTitle}>Week by week</h2>
          <NoFiles />
        </section>
      )}

      {(data.weeks.length > 0 || other.length > 0) && (
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
          {other.length > 0 && (
            <>
              <div className={c.week}>
                <span className={c.weekN} />
                <span className={c.weekTitle}>Other files</span>
              </div>
              <div className={cx(c.weekFiles, css.navList)} data-nav-list>
                {other.slice(0, 5).map((f) => (
                  <FileRow key={f.id} file={f} hideCourse />
                ))}
              </div>
            </>
          )}
          {!data.context && data.filesTotal > 0 && (
          <div className={c.links}>
            <Link href={keep(data.tabs.filesHref)} prefetch scroll={false} className={c.more}>
              {data.filesTotal === 1 ? "1 file" : `All ${data.filesTotal} files`} <Icon name="chevron-right" size={18} />
            </Link>
          </div>
          )}
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
                <div className={c.assessList}>
                  {data.grading.map((g) => (
                    <div key={g.title} className={c.assess}>
                      <span className={c.assessPct}>{g.pct}%</span>
                      <span className={c.boxText}>
                        <span className={c.assessTitle}>{g.title}</span>
                        <span className={c.assessNote}>{g.note}</span>
                      </span>
                    </div>
                  ))}
                </div>
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
    </>
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
        <RatingSummary {...s} />
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

      {data.rateHref ? (
        <div className={c.rate}>
          <ButtonLink href={data.rateHref} keyName="r">
            {data.rate?.label ?? "Rate this course"}
          </ButtonLink>
          <Hint>R</Hint>
        </div>
      ) : data.rate?.opensIn ? (
        <div className={c.rate}>
          <Button disabled>{data.rate.label}</Button>
          <span className={c.boxMeta}>Opens in week {data.rate.opensIn}</span>
        </div>
      ) : null}
    </aside>
  );
}
