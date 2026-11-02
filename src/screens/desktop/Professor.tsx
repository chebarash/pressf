import Link from "next/link";
import { Fragment } from "react";
import type { ProfessorData } from "./fixtures/types";
import { css, cx, Face, Hint, MentionCard, Pct, Trend } from "./parts";
import p from "./professor.module.css";

const SAY_TONES = [css.toneHigh, css.toneMid, css.tonePlum, css.toneMoss, css.toneLow];
const TILT = ["rotate(-1.5deg)", "rotate(-2deg)", "rotate(1.5deg)", "rotate(-1deg)", "rotate(2deg)", "rotate(-1.5deg)"];

/** D9 Professor — drawn face only, never a photo. Press F (or the key) to rate them. */
export default function DesktopProfessor({ data }: { data: ProfessorData }) {
  return (
    <main className={cx(css.screen, p.main)}>
      <nav className={p.crumbs} aria-label="Breadcrumb">
        {data.crumbs.map((c, i) => (
          <Fragment key={c.label}>
            {i > 0 && <span>/</span>}
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
          </Fragment>
        ))}
      </nav>

      <section className={p.hero}>
        <Face src={data.face} size={96} alt="" />
        <div className={p.who}>
          <h1 className={p.name}>{data.name}</h1>
          <p className={p.title}>{data.title}</p>
          <div className={p.stats}>
            {data.stats.map((s) => (
              <span key={s.label} className={cx(p.stat, s.accent && p.statAccent)}>
                <b>{s.value}</b>
                <span>{s.label}</span>
              </span>
            ))}
          </div>
        </div>
        {data.rateHref && (
          <Link href={data.rateHref} className={p.press} data-key="f">
            <span className={p.pressKey}>F</span>
            Press F if they taught you
            <Hint>F</Hint>
          </Link>
        )}
      </section>

      <div className={p.grid}>
        <section className={css.card}>
          <h2 className={p.cardTitle}>When and where · {data.schedule.term}</h2>
          <div>
            {data.schedule.rows.length === 0 && <p className={p.fine}>No classes this semester.</p>}
            {data.schedule.rows.map((r) => (
              <Link key={r.day + r.time + r.course} href={r.href} className={p.slot}>
                <span className={p.slotDay}>{r.day}</span>
                <span>{r.time}</span>
                <span>{r.course}</span>
                <span className={p.slotRole}>{r.role}</span>
                <span className={p.slotRoom}>{r.room}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className={css.card}>
          {data.trend.length > 1 && (
            <div>
              <p className={p.trendHead}>
                <span>Pressed F by semester</span>
                {data.delta && <span className={p.delta}>{data.delta}</span>}
              </p>
              <Trend points={data.trend} />
            </div>
          )}
          {data.byCourse.length > 0 && (
            <>
              <p className={p.label}>By course and role</p>
              {data.byCourse.map((b) => (
                <p key={b.label} className={p.leader}>
                  <span>{b.label}</span>
                  <b>{b.pct}%</b>
                </p>
              ))}
            </>
          )}
          {data.trend.length < 2 && data.byCourse.length === 0 && <p className={p.fine}>Not enough ratings yet. Shown from 5 students.</p>}
        </section>

        <section className={css.card}>
          <h2 className={p.cardTitle}>Courses</h2>
          <div className={cx(p.courses, css.navList)} data-nav-list>
            {data.courses.map((c) => (
              <Link key={c.code} href={c.href} className={p.course} data-nav-item>
                <span className={p.courseTop}>
                  <span>{c.code}</span>
                  <Pct value={c.pct} suffix=" F" />
                </span>
                <span className={p.courseName}>{c.name}</span>
                <span className={p.courseRole}>{c.role}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className={css.card}>
          <h2 className={p.cardTitle}>Students say</h2>
          {data.tags.length ? (
            <div className={p.says}>
              {data.tags.map((t, i) => (
                <span key={t.tag} className={cx(p.say, SAY_TONES[i % SAY_TONES.length])} style={{ transform: TILT[i % TILT.length] }}>
                  {t.tag}
                  <b>{t.pct}%</b>
                </span>
              ))}
            </div>
          ) : (
            <p className={p.fine}>No tags yet.</p>
          )}
        </section>

        <section className={css.card}>
          <h2 className={p.cardTitle}>What Anonymous says</h2>
          {data.mention ? <MentionCard m={data.mention} /> : <p className={p.fine}>Nothing on Anonymous yet.</p>}
        </section>

        <section className={css.card}>
          <h2 className={p.cardTitle}>Background</h2>
          {data.background.map((b) => (
            <div key={b.title} className={p.bg}>
              <span className={p.bgTitle}>{b.title}</span>
              <span className={p.bgMeta}>{b.meta}</span>
            </div>
          ))}
          <p className={p.fine}>From the LMS staff profile. Faces are drawn, never photos.</p>
        </section>
      </div>
    </main>
  );
}
