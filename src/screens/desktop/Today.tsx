import Link from "next/link";
import { Fragment } from "react";
import type { TodayView } from "@/server/views";
import { Banner } from "@/ui/components";
import * as adapt from "./adapt";
import type { TodayData } from "./model";
import { ButtonLink, CardHead, CourseCard, css, cx, FeedLink, FileRow, Hint } from "./parts";
import { Dismissible } from "./parts/Dismiss";
import t from "./today.module.css";

/** D1 Today — bento: next class and the day on top, then the feed, deadlines, exam, courses and rating. */
export type TodayActions = {
  /** "Later" on the rating ask: counts a dismissal for that term (server action). */
  dismissRating?: (term: string) => Promise<unknown>;
};

export default function DesktopToday({ data, actions }: { data: TodayView; actions?: TodayActions }) {
  return <TodayScreen data={adapt.today(data)} actions={actions} />;
}

export function TodayScreen({ data, actions }: { data: TodayData; actions?: TodayActions }) {
  const dismiss = data.rate?.term && actions?.dismissRating ? actions.dismissRating.bind(null, data.rate.term) : undefined;
  return (
    <main data-desktop-screen className={cx(css.screen, t.main)}>
      <header className={t.header}>
        <p className={t.greeting}>{data.greeting}</p>
        <h1 className={t.title}>{data.title}</h1>
        <p className={t.dateLine}>{data.dateLine}</p>
      </header>

      {data.banner && (
        <Banner tone={data.banner.tone} action={data.banner.action ?? undefined}>
          {data.banner.text}
        </Banner>
      )}

      <section className={t.row}>
        {data.next ? (
          <div className={cx(css.card, t.next)}>
            <p className={t.nextLabel}>
              <span className={t.dot} />
              {data.next.label}
            </p>
            <h2 className={t.nextTitle}>{data.next.title}</h2>
            <p className={t.nextLine}>{data.next.line}</p>
            {data.next.files.length > 0 && (
              <div className={t.materials}>
                {data.next.files.slice(0, 2).map((f) => (
                  <FileRow key={f.id} file={f} hideCourse />
                ))}
              </div>
            )}
            <div className={t.actions}>
              <ButtonLink href={data.next.href} keyName="Enter">
                Open course
              </ButtonLink>
              <Hint>↵</Hint>
              <span className={t.spacer} />
              {data.next.note && <p className={t.note}>{data.next.note}</p>}
            </div>
          </div>
        ) : (
          <div className={cx(css.card, t.next)}>
            <p className={t.nextLabel}>Nothing next today</p>
            <h2 className={t.nextTitle}>Free</h2>
          </div>
        )}

        <div className={css.card}>
          <CardHead title="Your day" link="Timetable" href="/timetable" hint="G T" />
          {data.day.length === 0 && <p className={t.quiet}>No classes today.</p>}
          {data.day.map((slot, i) => {
            const body = (
              <>
                <span className={cx(t.time, slot.tone === "next" && t.timeNext)}>{slot.time}</span>
                <span className={cx(t.shape, slot.tone === "next" && t.shapeNext, slot.tone === "deadline" && t.shapeDeadline)} />
                <span className={t.slotText}>
                  <span className={t.slotTitle}>{slot.title}</span>
                  <span className={t.slotMeta}>{slot.meta}</span>
                </span>
              </>
            );
            return (
              <Fragment key={`${slot.time}-${slot.title}`}>
                {data.now?.before === i && <p className={t.nowLine}>{data.now.time}</p>}
                {slot.href ? (
                  <Link href={slot.href} className={t.slot}>
                    {body}
                  </Link>
                ) : (
                  <div className={t.slot}>{body}</div>
                )}
              </Fragment>
            );
          })}
          {data.now && data.now.before >= data.day.length && data.day.length > 0 && <p className={t.nowLine}>{data.now.time}</p>}
        </div>
      </section>

      <section className={t.row}>
        <div className={cx(css.card, css.navList)} data-nav-list>
          <CardHead title="Notifications" link={data.feed.unread ? `${data.feed.unread} unread · all` : "All"} href="/notifications" hint="G N" />
          {data.feed.loading ? (
            <>
              {[0, 1, 2, 3].map((i) => <div key={i} className={t.skel} aria-hidden />)}
              <p className={t.loading}>Loading notifications…</p>
            </>
          ) : (
            data.feed.items.length === 0 && <p className={t.quiet}>All read. Grades, absences and LMS announcements land here.</p>
          )}
          {data.feed.items.map((n) => (
            <FeedLink key={n.id} kind={n.kind} title={n.title} meta={n.meta} unread={n.unread} href={n.href} files={n.files} />
          ))}
        </div>

        <div className={t.side}>
          <div className={css.card}>
            <CardHead title="Due soon" link="Assignments" />
            {data.due.length === 0 && <p className={t.quiet}>Nothing due this week.</p>}
            {data.due.map((d) => (
              <div key={d.title} className={t.due}>
                <span className={t.dueTitle}>{d.title}</span>
                <span className={t.dueMeta}>{d.meta}</span>
                <span className={cx(t.dueStatus, d.late && t.late)}>{d.status}</span>
              </div>
            ))}
          </div>
          {data.exam && (
            <div className={cx(css.card, t.exam)}>
              <p className={t.examEyebrow}>Next exam</p>
              <p className={t.examWhen}>{data.exam.when}</p>
              <div className={t.due}>
                <span className={t.examTitle}>{data.exam.title}</span>
                <span className={t.examMeta}>{data.exam.meta}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={t.row}>
        <div className={t.courses}>
          <CardHead title="My courses" link="All courses" href="/courses" hint="G C" />
          <div className={t.cards}>
            {data.courses.slice(0, 2).map((c) => (
              <CourseCard key={c.code} c={c} />
            ))}
          </div>
        </div>

        {data.rate && (
          <Dismissible className={cx(css.card, t.rate)} onDismiss={dismiss}>
            <p className={t.rateEyebrow}>{data.rate.eyebrow}</p>
            <h2 className={t.rateTitle}>{data.rate.title}</h2>
            <p className={t.rateText}>{data.rate.text}</p>
            <div className={t.rateActions}>
              <ButtonLink href={data.rate.href} keyName="r">
                Rate now
              </ButtonLink>
              <button type="button" className={css.textBtn} data-dismiss>
                Later
              </button>
            </div>
          </Dismissible>
        )}
      </section>
    </main>
  );
}
