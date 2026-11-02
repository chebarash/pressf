import Link from "next/link";
import type { TodayView } from "@/server/views";
import { CourseCard, QuickTile, Tag } from "@/ui/components";
import { BookIcon, CalendarIcon, CheckIcon, ChevronRightIcon, ClockIcon, QrIcon } from "@/ui/icons";
import "@/ui/tokens.css";
import s from "./mobile.module.css";
import { FeedRow } from "./parts/FeedRow";
import { GuestHome } from "./today/GuestHome";
import { RatingCard, TodayBanner, TodayBar } from "./today/Islands";
import { caughtUp, checkInClass, details, dueLate, hero, nextExamCard, ratingAsk, showClasses, subtitle, tiles, todayFeed, type Tile } from "./today/model";
import { isGuest, type TodayData } from "./today/types";

/** Today on mobile (Figma 2.1–2.13, 10.1; 1.2 for guests). */
export default function Today({ data }: { data: TodayData }) {
  if (isGuest(data)) return <GuestHome data={data} />;
  return <StudentHome v={data} />;
}

const TILE_ICON: Record<Tile["id"], React.ReactNode> = {
  timetable: <ClockIcon size={18} />,
  progress: <CheckIcon size={18} />,
  calendar: <CalendarIcon size={18} />,
  courses: <BookIcon size={18} />,
  qr: <QrIcon size={18} />,
};

const TILE_TONE = { default: "default", warn: "warning", accent: "accent" } as const;

export function SectionHead({ title, href, label = "All" }: { title: string; href?: string; label?: string }) {
  return (
    <div className={s.sectionHead}>
      <h2 className={`${s.sectionTitle} t-mobile-section`}>{title}</h2>
      {href && (
        <Link href={href} className={s.sectionAll}>
          {label}
          <ChevronRightIcon size={16} />
        </Link>
      )}
    </div>
  );
}

function StudentHome({ v }: { v: TodayView }) {
  const h = hero(v);
  const exam = nextExamCard(v);
  const feed = todayFeed(v);
  const live = checkInClass(v);
  const ask = ratingAsk(v);
  const top = v.banner?.kind === "semester-start" ? v.banner : null;
  const below = v.banner && !top ? v.banner : null;

  return (
    <div className={s.screen}>
      <header className={s.head}>
        <h1 className={`${s.title} t-mobile-title`}>{v.title}</h1>
        <p className={`${s.subtitle} t-body-md`}>{subtitle(v)}</p>
      </header>

      {top && <TodayBanner banner={top} />}

      <nav className={s.tiles} aria-label="Quick access">
        {tiles(v).map((t) => (
          <QuickTile key={t.id} href={t.href} label={t.title} info={t.sub} icon={TILE_ICON[t.id]} tone={TILE_TONE[t.tone]} className={s.tile} />
        ))}
      </nav>

      {below && <TodayBanner banner={below} />}

      <div className={s.content}>
        {h && (
          <section className={s.hero} aria-label={h.eyebrow}>
            <p className={s.heroEyebrow}>{h.eyebrow}</p>
            <p className={`${s.heroTitle} t-mobile-section`}>{h.title}</p>
            {h.line && <p className={s.heroLine}>{h.line}</p>}
            {h.sub && <p className={s.heroSub}>{h.sub}</p>}
          </section>
        )}

        {showClasses(v) && (
          <ol className={s.list} aria-label="Today's classes">
            {v.classes.map((c) => {
              const lit = c.status === "next" || c.status === "now";
              return (
                <li key={c.key}>
                  <Link href="/timetable" className={`${s.classRow} ${lit ? s.classNext : c.status === "done" ? s.classDone : ""}`}>
                    <span className={`${s.classTime} t-label-lg`}>{c.time}</span>
                    <span className={s.classText}>
                      <span className={`${s.classSubject} t-label-lg`}>{c.name}</span>
                      <span className={`${s.classDetails} t-body-sm`}>{details(c)}</span>
                    </span>
                    {lit && <Tag tone="dark">{c.status === "now" ? "Now" : "Next"}</Tag>}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}

        {ask && <RatingCard ask={ask} />}

        {v.notifications.items.length > 0 && (
          <section className={s.section} aria-label="Notifications">
            <SectionHead title="Notifications" href={caughtUp(v) ? undefined : "/notifications"} />
            {caughtUp(v) ? (
              <p className={s.caughtUp}>
                <CheckIcon size={18} />
                {v.dueSoon.length ? "You're all caught up." : "You're all caught up. Nothing due this week."}
              </p>
            ) : (
              <div className={s.listTight}>
                {feed.map((i) => (
                  <FeedRow key={i.id} item={i} href={`/notifications?open=${encodeURIComponent(i.id)}`} />
                ))}
              </div>
            )}
          </section>
        )}

        {v.dueSoon.length > 0 && (
          <section className={`${s.section} ${s.list12}`} aria-label="Due soon">
            <SectionHead title="Due soon" href="/progress" />
            {v.dueSoon.map((x) => (
              <Link key={x.id} href="/progress" className={s.dueRow}>
                <span className={s.dueText}>
                  <span className={s.dueTitle}>{x.title}</span>
                  <span className={s.dueMeta}>
                    {x.course} · {x.dueLabel}
                  </span>
                  <span className={`${s.dueStatus} ${dueLate(x) ? s.dueLate : ""}`}>{x.statusLabel}</span>
                </span>
                <ChevronRightIcon size={18} />
              </Link>
            ))}
          </section>
        )}

        {exam && (
          <Link href="/calendar" className={s.hero}>
            <span className={s.heroEyebrow}>Next exams</span>
            <span className={`${s.heroTitle} t-mobile-section`}>{exam.title}</span>
            <span className={s.heroLine}>{exam.line}</span>
            <span className={s.heroSub}>{exam.sub}</span>
          </Link>
        )}

        {v.courses.length > 0 && (
          <section className={s.list} aria-label="My courses">
            <SectionHead title="My courses" href="/courses" />
            {v.courses.map((c) => (
              <CourseCard
                key={c.courseId}
                code={c.code}
                name={c.name}
                href={c.href}
                line={c.when ?? undefined}
                teacher={c.teacher ? { name: c.teacher.name, face: null } : undefined}
                recommend={c.recommendPct == null ? undefined : { pct: c.recommendPct }}
              />
            ))}
          </section>
        )}
      </div>

      <TodayBar checkIn={!!live} classEnd={live?.endTime} classLine={live ? [live.name, live.room].filter(Boolean).join(" · ") : undefined} rating={ask} />
    </div>
  );
}
