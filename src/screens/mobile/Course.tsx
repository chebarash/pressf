import { BOT_USERNAME, path, uploadLink } from "@/core/links";
import { cx, Face, Tabs, Tag } from "@/ui/components";
import b from "./parts/base.module.css";
import s from "./parts/Course.module.css";
import { FilesBrowser, SemesterSwitch, TelegramLink, WeekList, type TermLink } from "./parts/CourseClient";
import { CourseRatingStrip, CourseRatingSummary, FewRatings, GateNotice, Ghost, MentionCard, Syllabus, TeacherCard, YouCard } from "./parts/CourseParts";
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
  const termParam = data.term && data.term.courseId !== latest?.courseId ? data.term.term : undefined;
  const href = (tab: CourseTab) => path({ to: "course", code: data.code, tab, term: termParam });
  const note = (courseId: string) => (data.term?.courseId === courseId && data.termStatus === "took" ? "You took it" : latest?.courseId === courseId ? "Now" : null);
  const terms: TermLink[] = data.terms.map((t) => ({
    term: t.term,
    note: note(t.courseId),
    teachers: t.teachers.join(", "),
    href: path({ to: "course", code: data.code, tab: data.tab, term: t.courseId === latest?.courseId ? undefined : t.term }),
    selected: t.courseId === data.courseId,
  }));
  const tabs = [
    { tab: "overview" as const, label: "Overview" },
    ...(data.signedIn && data.files ? [{ tab: "files" as const, label: data.files.all ? `Files ${data.files.all}` : "Files" }] : []),
    { tab: "anonymous" as const, label: `Anonymous ${data.anonymous.count}` },
  ];
  const action: { text: string; href?: string; disabled?: boolean } | null = !data.signedIn
    ? { text: "Sign in with LMS", href: `/sign-in?next=${encodeURIComponent(href(data.tab))}` }
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
        </div>
        <h1 className={s.title}>{data.name}</h1>
        {data.signedIn && data.term && data.terms.length > 1 ? <SemesterSwitch label={`${data.term.term}${note(data.term.courseId) ? ` · ${note(data.term.courseId)}` : ""}`} terms={terms} /> : null}
        <CourseRatingStrip summary={data.ratings} />
      </header>

      <Tabs label="Course sections" className={s.tabs} items={tabs.map((t) => ({ label: t.label, value: t.tab, href: href(t.tab), active: data.tab === t.tab }))} />

      {data.tab === "files" && data.files ? <FilesTab data={data} /> : data.tab === "anonymous" ? <AnonymousTab data={data} /> : <Overview data={data} filesHref={href("files")} />}

      {data.notice === "rating-sent" ? <Notice text="Rating sent. Thanks — it's anonymous." param="sent" /> : null}
      {action ? <MainButton text={action.text} href={action.href} disabled={action.disabled} /> : null}
    </div>
  );
}

function Overview({ data, filesHref }: { data: CourseScreen; filesHref: string }) {
  const summaryFirst = !data.you;
  const share = data.signedIn ? (
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
            {hasFiles || data.weeks.some((w) => w.topic) ? <WeekList weeks={data.weeks} filesHref={filesHref} filesTotal={data.files?.all ?? 0} extra={share} /> : <NoFiles />}
            {!hasFiles && !data.weeks.some((w) => w.topic) ? share : null}
          </section>
        ) : (
          <section className={s.weeks}>
            <GateNotice />
            <h2 className={cx(b.section, s.blurred)} aria-hidden>
              Week by week
            </h2>
            <Ghost rows={4} />
          </section>
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
          <section className={s.block}>
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
                </div>
                <div className={s.foldBody}>
                  <Ghost rows={3} />
                </div>
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

function NoFiles() {
  return (
    <div className={b.empty}>
      <Face kind="mascot" size={96} />
      <h2 className={b.emptyTitle}>No files yet</h2>
      <p className={b.emptyText}>Files show up here as soon as teachers upload them to LMS. We check every few hours.</p>
    </div>
  );
}

function FilesTab({ data }: { data: CourseScreen }) {
  const files = data.files?.items ?? [];
  if (!files.length) return <NoFiles />;
  const topics = Object.fromEntries((data.weeks ?? []).filter((w) => w.week !== null && w.topic).map((w) => [w.week, w.topic as string]));
  return (
    <div className={s.content}>
      <div className={s.block}>
        <FilesBrowser files={files} topics={topics} />
      </div>
    </div>
  );
}

function AnonymousTab({ data }: { data: CourseScreen }) {
  if (!data.anonymous.latest.length) {
    return (
      <div className={b.empty}>
        <Face kind="mascot" size={96} />
        <h2 className={b.emptyTitle}>Quiet so far</h2>
        <p className={b.emptyText}>Posts in the students&apos; Anonymous channel that mention {data.name} show up here.</p>
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
