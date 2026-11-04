import Link from "next/link";
import type { ReactNode } from "react";
import type { CourseData } from "../model";
import { Disclosure, RatingSummary } from "@/ui/components";
import { TabPill } from "@/ui/components/TabPill";
import { PageHead } from "@/ui/shell/PageHeader";
import { Syllabus } from "@/screens/mobile/parts/CourseParts";
import { Button, ButtonLink, css, cx, Empty, Face, FileRow, Hint, Icon, KeyTo, MentionCard, RatingStrip, Score, shareHref, Tag } from "../parts";
import c from "./course.module.css";
import { CourseFiles } from "./CourseFiles";
import { MoreMentions } from "@/screens/shared/MoreMentions";
import { CourseList } from "./CourseList";
import { TermPicker } from "./TermPicker";

export type CourseTab = "overview" | "files" | "anonymous";

/** List · detail · inspector. The File screen swaps the inspector for the preview. */
export function CourseLayout({ data, aside, tab = "overview", open = true }: { data: CourseData; aside?: ReactNode; tab?: CourseTab; /** The URL named this course (false on /courses, which shows the first one): a one-pane window shows the list instead. */ open?: boolean }) {
  const withList = !!data.myCourses;
  return (
    <div data-desktop-screen data-open={open || !withList || undefined} className={cx(css.screen, c.layout, !!aside && withList && c.layoutFile, !withList && c.layoutNoList)}>
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
      <PageHead
        title={data.name}
        sub={
          <span className={c.tags}>
            <Tag>{data.code}</Tag>
            {data.kind && <Tag tone="neutral">{data.kind}</Tag>}
          </span>
        }
      >
        {!data.context && (
          <a href={shareHref(`/c/${encodeURIComponent(data.code)}`, data.name)} className={c.shareLink} target="_blank" rel="noopener">
            <Icon name="send" size={16} /> Share
          </a>
        )}
        {/* One pane at a time on a narrow window: the way back to the list. */}
        {data.myCourses && (
          <Link prefetch href="/courses" className={cx("pf-head__back", c.narrowOnly)}>
            <span aria-hidden>‹</span> Courses
          </Link>
        )}
      </PageHead>
      <header className={c.head}>
        {data.context ? (
          <Link prefetch href={`/c/${data.code}`} className={c.more}>
            Open the course <Icon name="chevron-right" size={18} />
          </Link>
        ) : (
          <>
        {data.term.label && <TermPicker label={data.term.label} options={data.term.options} />}
        <RatingStrip strip={data.strip} />
          </>
        )}
      </header>

      {!data.context && (
      <nav className={c.tabs} aria-label="Course sections">
        <Link href={overviewHref} prefetch scroll={false} className={cx(c.tab, tab === "overview" && c.tabOn)} aria-current={tab === "overview" ? "page" : undefined}>
          {tab === "overview" && <TabPill group="course-sections" className={c.tabPill} />}
          {data.tabs.overview}
        </Link>
        {!data.locked && (
          <KeyTo k="f">
            <Link href={keep(data.tabs.filesHref)} prefetch scroll={false} className={cx(c.tab, tab === "files" && c.tabOn)} aria-current={tab === "files" ? "page" : undefined}>
              {tab === "files" && <TabPill group="course-sections" className={c.tabPill} />}
              Files {data.tabs.files || ""}
            </Link>
          </KeyTo>
        )}
        <Link href={keep(data.tabs.anonymousHref)} prefetch scroll={false} className={cx(c.tab, tab === "anonymous" && c.tabOn)} aria-current={tab === "anonymous" ? "page" : undefined}>
          {tab === "anonymous" && <TabPill group="course-sections" className={c.tabPill} />}
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
        <MoreMentions kind="course" target={data.code} shown={posts.length} total={data.tabs.anonymous} variant="desktop" tag="Course" className={c.morePosts} />
      </div>
    </section>
  );
}

function Overview({ data, keep }: { data: CourseData; keep: (href: string) => string }) {
  const other = data.otherFiles ?? [];
  const empty = !data.locked && !data.context && data.weeks.length === 0 && other.length === 0;
  const openWeek = (data.weeks.find((w) => w.current) ?? data.weeks.find((w) => w.files.length > 0))?.n ?? null;
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
            // Each week opens and closes in place; this week (else the first with files) starts open.
            <Disclosure
              key={w.n}
              className={c.weekFold}
              headClassName={cx(c.week, w.current && c.weekNow)}
              bodyClassName={c.weekBody}
              defaultOpen={w.n === openWeek}
              trailing={w.current ? <Tag tone="dark">This week</Tag> : undefined}
              summary={
                <>
                  <span className={c.weekN}>{w.n}</span>
                  <span className={c.weekTitle}>{w.title}</span>
                </>
              }
            >
              {w.files.length > 0 ? (
                <div className={cx(c.weekFiles, css.navList)} data-nav-list>
                  {w.files.map((f) => (
                    <FileRow key={f.id} file={f} hideCourse />
                  ))}
                </div>
              ) : (
                <p className={cx(c.boxMeta, c.weekEmpty)}>No files for this week yet.</p>
              )}
            </Disclosure>
          ))}
          {other.length > 0 && (
            <Disclosure
              className={c.weekFold}
              headClassName={c.week}
              bodyClassName={c.weekBody}
              defaultOpen={data.weeks.length === 0}
              summary={
                <>
                  <span className={c.weekN} />
                  <span className={c.weekTitle}>Other files · {other.length}</span>
                </>
              }
            >
              <div className={cx(c.weekFiles, css.navList)} data-nav-list>
                {other.slice(0, 5).map((f) => (
                  <FileRow key={f.id} file={f} hideCourse />
                ))}
              </div>
            </Disclosure>
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
              <Link prefetch key={t.id + t.line} href={t.href} className={c.boxRow}>
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

      {data.syllabusFold ? (
        <section className={c.section}>
          <h2 className={c.sectionTitle}>Syllabus</h2>
          {/* Same folds as mobile 4.2: grading open, the rest one click away. */}
          <Syllabus syl={data.syllabusFold} />
        </section>
      ) : null}
    </>
  );
}

function CourseInspector({ data }: { data: CourseData }) {
  const s = data.summary;
  return (
    <aside className={c.inspector} aria-label="About this course">
      {data.me && (
        <Link prefetch href={data.me.href} className={c.me}>
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
        // Not a button before the window opens: only when it will be possible.
        <p className={c.boxMeta}>You can rate this course from week {data.rate.opensIn}.</p>
      ) : null}
    </aside>
  );
}
