import { BOT_USERNAME, path, uploadLink } from "@/core/links";
import { cx, EmptyState, Tabs, Tag } from "@/ui/components";
import b from "./parts/base.module.css";
import s from "./parts/Course.module.css";
import { FilesBrowser, SemesterSwitch, TelegramLink, WeekList, type TermLink } from "./parts/CourseClient";
import { ChevronDownIcon, ChevronRightIcon } from "@/ui/icons";
import { CourseRatingStrip, CourseRatingSummary, FewRatings, GateNotice, GhostWeeks, MentionCard, Syllabus, TeacherCard, YouCard } from "./parts/CourseParts";
import { ShareButton } from "./parts/FileActions";
import { MainButton } from "./parts/MainButton";
import { Notice } from "./parts/Notice";
import type { CourseScreen, CourseTab } from "./views";

/**
 * Mobile Course (Figma 4.2 current · 4.3 pick semester · 4.4 semester you took ·
 * 4.5 not yours · 4.6 guest · 4.7 all files · 4.8 no files · 4.13 rating sent ·
 * 4.18 few ratings · 11.1 share a file · 11.6 file from students). The semester
 * picker drives the whole page; gated parts arrive as null for guests.
 */
export default function Course({ data }: { data: CourseScreen }) {
  const latest = data.terms.find((t) => t.current);
  const termParam = data.term && data.term.term !== latest?.term ? data.term.term : undefined;
  const href = (tab: CourseTab) => path({ to: "course", code: data.code, tab, term: termParam });
  const note = (term: string) => (data.term?.term === term && data.termStatus === "took" ? "You took it" : latest?.term === term ? "Now" : null);
  const terms: TermLink[] = data.terms.map((t) => ({
    term: t.term,
    note: note(t.term),
    teachers: t.teachers.join(", "),
    href: path({ to: "course", code: data.code, tab: data.tab, term: t.term === latest?.term ? undefined : t.term }),
    selected: t.courseIds.includes(data.courseId),
  }));
  const tabs = [
    { tab: "overview" as const, label: "Overview" },
    ...(data.signedIn && data.files ? [{ tab: "files" as const, label: data.files.all ? `Files ${data.files.all}` : "Files" }] : []),
    { tab: "anonymous" as const, label: `Anonymous ${data.anonymous.count}` },
  ];
  const action: { text: string; href?: string; disabled?: boolean } | null = !data.signedIn
    ? { text: "Sign in with LMS", href: `/sign-in?next=${encodeURIComponent(href(data.tab))}` }
    : data.tab === "files"
      ? null // Figma 4.7: the Files tab has no MainButton.
      : data.rate?.canRate
      ? { text: data.rate.rated || data.notice === "rating-sent" ? "Edit your rating" : "Rate this course", href: `${data.rate.href}?from=${encodeURIComponent(`/c/${data.code}`)}` }
      : data.rate?.opensIn
        ? { text: `Opens in week ${data.rate.opensIn}`, disabled: true }
        : null;

  return (
    <div className={cx(b.screen, !action && b.noButton)}>
      <header className={s.header}>
        <div className={s.tags}>
          <Tag tone="accent">{data.code}</Tag>
          <ShareButton target={{ to: "course", code: data.code }} title={data.name} text={data.name} className={s.shareCourse} />
        </div>
        <h1 className={s.title}>{data.name}</h1>
        {data.signedIn && data.term && data.terms.length > 1 ? <SemesterSwitch label={`${data.term.term}${note(data.term.term) ? ` · ${note(data.term.term)}` : ""}`} terms={terms} /> : null}
        <CourseRatingStrip summary={data.ratings} />
      </header>

      <Tabs label="Course sections" size="l" className={s.tabs} items={tabs.map((t) => ({ label: t.label, value: t.tab, href: href(t.tab), active: data.tab === t.tab }))} />

      {data.tab === "files" && data.files ? <FilesTab data={data} /> : data.tab === "anonymous" ? <AnonymousTab data={data} /> : <Overview data={data} filesHref={href("files")} />}

      {data.notice === "rating-sent" ? <Notice text="Rating sent. Thanks — it's anonymous." param="sent" /> : null}
      {action ? <MainButton text={action.text} href={action.href} disabled={action.disabled} /> : null}
    </div>
  );
}

function Overview({ data, filesHref }: { data: CourseScreen; filesHref: string }) {
  const summaryFirst = !data.you;
  // Figma 11.1: students taking the course this semester get the bot shortcut (not in 4.4 took, 4.5 not yours).
  const share = data.you?.status === "now" ? (
    <TelegramLink href={uploadLink(data.code)} className={s.share}>
      <span className={s.shareIcon} aria-hidden>
        +
      </span>
      <span className={b.rowBody}>
        <span className={b.rowTitle}>Share a file via the bot</span>
        <span className={s.shareSub}>
          Opens @{BOT_USERNAME} with {data.name} picked — just send the file
        </span>
      </span>
    </TelegramLink>
  ) : null;
  const hasFiles = !!data.files?.all;
  // Figma 4.18: under 5 ratings the "Not enough ratings yet" card takes the summary's place.
  const ratings = data.ratings.enough ? <CourseRatingSummary summary={data.ratings} /> : <FewRatings count={data.ratings.count} />;

  return (
    <>
      <div className={s.content}>
        {data.you ? <YouCard you={data.you} /> : null}
        {summaryFirst ? ratings : null}

        {data.weeks ? (
          <section className={s.weeks}>
            <h2 className={b.section}>Week by week</h2>
            {hasFiles || data.weeks.some((w) => w.topic) ? <WeekList weeks={data.weeks} filesHref={filesHref} filesTotal={data.files?.all ?? 0} extra={share} teachingWeek={data.teachingWeek} /> : <NoFiles />}
            {!hasFiles && !data.weeks.some((w) => w.topic) ? share : null}
          </section>
        ) : (
          <>
            <GateNotice />
            <section className={cx(s.weeks, s.blurred)} aria-hidden>
              <h2 className={b.section}>Week by week</h2>
              <GhostWeeks />
            </section>
          </>
        )}

        {data.teachers.length ? (
          <section className={s.block}>
            <h2 className={b.section}>Who teaches it</h2>
            {data.teachers.map((t) => (
              <TeacherCard key={`${t.id}|${t.role}`} t={t} />
            ))}
          </section>
        ) : null}

        {data.syllabus || !data.signedIn ? (
          <section className={s.syllabusBlock}>
            <h2 className={b.section}>Syllabus</h2>
            {data.syllabus ? (
              <Syllabus syl={data.syllabus} />
            ) : (
              <div className={s.syllabus}>
                <div className={s.foldHead}>
                  <span className={s.foldText}>
                    <span className={s.foldTitle}>Grading</span>
                    <span className={s.foldSub}>From the course syllabus</span>
                  </span>
                  <ChevronDownIcon size={18} />
                </div>
                <div className={cx(s.foldBody, s.blurred)} aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={s.assess}>
                      <span className={s.ghostPct} />
                      <span className={s.ghostItem}>
                        <span className={s.ghostBar} style={{ width: 120 - i * 10 }} />
                        <span className={s.ghostBar} style={{ width: 170 + i * 20, height: 10 }} />
                      </span>
                    </div>
                  ))}
                </div>
                {/* Section names only: their contents are for signed-in students. */}
                {["Credits and workload", "What you'll learn", "Books", "Prerequisites"].map((t) => (
                  <div key={t} className={cx(s.fold, s.foldHead)}>
                    <span className={s.foldText}>
                      <span className={s.foldTitle}>{t}</span>
                    </span>
                    <ChevronRightIcon size={18} />
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {!summaryFirst ? ratings : null}
      </div>

      {data.anonymous.latest.length ? (
        <section className={s.band}>
          <h2 className={b.section}>What Anonymous says</h2>
          <MentionCard m={data.anonymous.latest[0]} />
        </section>
      ) : null}
    </>
  );
}

/** Figma 4.8: EmptyState in the Files tab. */
function NoFiles() {
  return <EmptyState title="No files yet" text="Files show up here as soon as teachers upload them to LMS. We check every few hours." />;
}

function FilesTab({ data }: { data: CourseScreen }) {
  const files = data.files?.items ?? [];
  if (!files.length) {
    return (
      <div className={s.content}>
        <NoFiles />
      </div>
    );
  }
  const topics = Object.fromEntries((data.weeks ?? []).filter((w) => w.week !== null && w.topic).map((w) => [w.week, w.topic as string]));
  return (
    <div className={s.content}>
      <div className={s.files}>
        <FilesBrowser files={files} topics={topics} />
      </div>
    </div>
  );
}

function AnonymousTab({ data }: { data: CourseScreen }) {
  if (!data.anonymous.latest.length) {
    return (
      <div className={s.content}>
        <EmptyState title="Quiet so far" text={`Posts in the students' Anonymous channel that mention ${data.name} show up here.`} />
      </div>
    );
  }
  return (
    <div className={s.content}>
      <section className={s.block}>
        <p className={b.sub}>
          {data.anonymous.count} {data.anonymous.count === 1 ? "post mentions" : "posts mention"} {data.name}
        </p>
        {data.anonymous.latest.map((m) => (
          <MentionCard key={m.id} m={m} />
        ))}
      </section>
    </div>
  );
}
