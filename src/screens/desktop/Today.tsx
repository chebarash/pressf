import Link from "next/link";
import { Fragment } from "react";
import type { TodayView } from "@/server/views";
import { Banner } from "@/ui/components";
import { PageHead } from "@/ui/shell/PageHeader";
import * as adapt from "./adapt";
import type { TodayData } from "./model";
import { ButtonLink, CardHead, CourseCard, css, cx, FeedLink, FileRow, Hint } from "./parts";
import { Icon } from "./parts/Icon";
import { Dismissible } from "./parts/Dismiss";
import t from "./today.module.css";

/** D1 Today — bento: the next class, the feed and courses on the left; the day, deadlines, exam and rating on the right. */
export type TodayActions = {
  /** "Later" on the rating ask: counts a dismissal for that term (server action). */
  dismissRating?: (term: string) => Promise<unknown>;
};

export default function DesktopToday({ data, actions }: { data: TodayView; actions?: TodayActions }) {
  return <TodayScreen data={adapt.today(data)} actions={actions} />;
}

/** Courses on Today: two rows at most; "All courses" has the rest. */
const COURSES = 4;

export function TodayScreen({ data, actions }: { data: TodayData; actions?: TodayActions }) {
  const dismiss = data.rate?.term && actions?.dismissRating ? actions.dismissRating.bind(null, data.rate.term) : undefined;
  const courses = data.courses.slice(0, COURSES);
  return (
    <main data-desktop-screen className={cx(css.screen, t.main)}>
      <PageHead title={data.title} sub={`${data.greeting} · ${data.dateLine}`} />

      {data.banner && (
        <Banner tone={data.banner.tone} action={data.banner.action ?? undefined} className={t.banner}>
          {data.banner.text}
        </Banner>
      )}

      {/* Two columns that each stack their own cards (Figma D1: 736 + 360), so a short
          card never leaves a hole beside a tall one. One column under 900: the
          cards then interleave in reading order (next, day, feed, due, exam, courses, rate). */}
      <div className={t.bento}>
        <div className={t.col}>
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
            <div className={cx(css.card, t.next, t.free)}>
              <p className={t.nextLabel}>
                <span className={cx(t.dot, t.dotFree)} />
                No classes coming up
              </p>
              <h2 className={t.nextTitle}>Free</h2>
              <p className={t.nextLine}>Enjoy it. New grades, files and announcements still show up here.</p>
              <div className={t.actions}>
                <ButtonLink href="/timetable" variant="secondary" keyName="Enter">
                  Open timetable
                </ButtonLink>
                <Hint>↵</Hint>
              </div>
            </div>
          )}

          <div className={cx(css.card, css.navList, t.feed)} data-nav-list>
            <CardHead title="Notifications" link={data.feed.unread ? `${data.feed.unread} unread · all` : "All"} href="/notifications" hint="F N" />
            {data.feed.loading ? (
              <>
                {[0, 1, 2, 3].map((i) => <div key={i} className={t.skel} aria-hidden />)}
                <p className={t.loading}>Loading notifications…</p>
              </>
            ) : (
              data.feed.items.length === 0 && (
                <p className={t.caught}>
                  <span className={t.caughtIcon} aria-hidden>
                    <Icon name="check" size={16} />
                  </span>
                  <span>
                    <b>All caught up.</b> Grades, absences and LMS announcements land here.
                  </span>
                </p>
              )
            )}
            {data.feed.items.map((n) => (
              <FeedLink key={n.id} kind={n.kind} title={n.title} meta={n.meta} unread={n.unread} href={n.href} files={n.files} mark={n.mark} />
            ))}
          </div>

          <section className={t.courses} aria-label="My courses">
            <CardHead title="My courses" link={data.courses.length > COURSES ? `All ${data.courses.length} courses` : "All courses"} href="/courses" hint="F C" />
            {courses.length > 0 ? (
              <div className={t.cards}>
                {courses.map((c) => (
                  <CourseCard key={c.code} c={c} />
                ))}
              </div>
            ) : (
              <p className={cx(css.card, t.quiet)}>No courses for this semester yet. They appear once the registrar publishes them in the LMS.</p>
            )}
          </section>
        </div>

        <div className={t.col}>
          <div className={cx(css.card, t.day)}>
            <CardHead title="Your day" link="Timetable" href="/timetable" hint="F T" />
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
                    <Link prefetch href={slot.href} className={t.slot}>
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

          <div className={cx(css.card, t.dueCard)}>
            <CardHead title="Due soon" link="Assignments" href="/progress/assignments" />
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
        </div>
      </div>
    </main>
  );
}
