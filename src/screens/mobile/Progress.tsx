import Link from "next/link";
import { tier } from "@/core/grades";
import type { ProgressCourse, ProgressView } from "@/server/views";
import { Banner, EmptyState, Score, type ScoreTier } from "./mc/kit";
import { Absences, Chevron, cx, Screen, Stat } from "./mc/parts";
import { lowerDay, since } from "./mc/format";
import s from "./mc/mc.module.css";

const TIER: Record<ReturnType<typeof tier>, ScoreTier> = { High: "high", Mid: "mid", Low: "low", None: "none" };
const fmt = (n: number | null) => (n === null ? null : n.toFixed(2));

/** Mobile Progress (Figma 5.1, 5.3 nothing yet, 5.5 LMS not answering, 5.6 semester results). */
export default function Progress({ data }: { data: ProgressView }) {
  if (data.results) return <Results data={data} />;
  return (
    <Screen>
      <div className={s.body}>
        <h1 className={cx(s.title, "t-mobile-title")}>Progress</h1>
        {data.state.lmsDown ? (
          <Banner tone="warning" action={{ label: "Retry", href: "?retry=1" }}>
            LMS isn&apos;t answering. Grades and absences are from {since(data.state.syncedAt)}.
          </Banner>
        ) : null}
        {data.empty && !data.courses.length ? (
          <EmptyState title="No grades yet" text="First marks usually land after week 3. We'll message you in Telegram when one arrives." />
        ) : (
          <>
            {data.empty ? null : (
              <div className={s.stats}>
                <Stat value={fmt(data.gpa) ?? "—"} label="GPA" />
                {data.ectsEarned !== null ? <Stat value={String(data.ectsEarned)} label={data.ectsTotal ? `of ${data.ectsTotal} ECTS` : "ECTS"} /> : null}
                {data.semesterNumber ? <Stat value={String(data.semesterNumber)} label="semester" /> : null}
              </div>
            )}
            {data.courses.length ? (
              <>
                <h2 className={cx(s.section, "t-mobile-section")}>This semester</h2>
                {data.courses.map((c) => (
                  <CourseCard key={c.courseId} c={c} />
                ))}
              </>
            ) : null}
            {data.earlier.length ? (
              <>
                <h2 className={cx(s.section, "t-mobile-section")}>Earlier semesters</h2>
                {data.earlier.map((e) => (
                  <div key={e.term} className={cx(s.rowCard, s.quiet)}>
                    <div className={s.lines}>
                      <p className={s.t15sb}>{e.term}</p>
                      <p className={cx(s.t12, s.soft)}>
                        {[e.gpa !== null ? `GPA ${e.gpa.toFixed(2)}` : `${e.courses} ${e.courses === 1 ? "course" : "courses"}`, e.ects !== null ? `${e.ects} ECTS` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            ) : null}
          </>
        )}
        {data.rate.waiting ? (
          <Link href="/rate" prefetch className={cx(s.rowCard, s.warm, s.pressable)} style={{ padding: 14 }}>
            <div className={s.lines}>
              <p className={s.t16sb}>
                {data.rate.waiting} {data.rate.waiting === 1 ? "course" : "courses"} to rate
              </p>
              <p className={s.t12}>
                {[data.rate.term, `${data.rate.rated} of ${data.rate.rated + data.rate.waiting} rated`].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Chevron />
          </Link>
        ) : null}
      </div>
    </Screen>
  );
}

function CourseCard({ c }: { c: ProgressCourse }) {
  const mark = c.mark === null ? null : Math.round(c.mark);
  const body = (
    <>
      <div className={s.head}>
        <Score value={mark === null ? "—" : String(mark)} tier={TIER[c.tier]} label={mark === null ? "No marks yet" : `Average ${mark}`} />
        <div className={s.lines}>
          <p className={s.t16sb}>{c.name}</p>
          <p className={cx(s.t12, s.soft)}>
            {c.average === null ? "No marks yet" : [`Average ${Math.round(c.average)}`, c.rating !== null ? `rating ${Math.round(c.rating)}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Chevron />
      </div>
      {c.absences ? <Absences a={c.absences} /> : null}
      {c.next ? (
        <p className={cx(s.p0, s.t12m, s.accentText)}>
          Next: {c.next.title} · {lowerDay(c.next.dueLabel)}
        </p>
      ) : null}
    </>
  );
  return (
    <Link href={c.href} prefetch scroll={false} className={cx(s.card, s.pressable)}>
      {body}
    </Link>
  );
}

/** 5.6: the semester's final grades and the rating ask. */
function Results({ data }: { data: ProgressView }) {
  const r = data.results!;
  const passed = r.courses.filter((c) => c.passed).length;
  return (
    <Screen>
      <div className={cx(s.body, s.tight)}>
        <h1 className={s.title54}>{r.term} done</h1>
        <p className={cx(s.p0, s.t14, s.soft)}>
          Final grades are in · {passed} of {r.courses.length} passed
        </p>
        <div className={s.stats} style={{ gap: 24 }}>
          {data.gpa !== null ? <Stat size="kpi" value={data.gpa.toFixed(2)} label="overall GPA" /> : null}
          {data.ectsEarned !== null ? <Stat size="kpi" value={String(data.ectsEarned)} label={data.ectsTotal ? `of ${data.ectsTotal} ECTS` : "ECTS"} /> : null}
        </div>
        {r.courses.map((c) => {
          const mark = c.mark === null ? null : Math.round(c.mark);
          const t: ScoreTier = c.fx || c.passed === false ? "low" : TIER[tier(c.mark)];
          return (
            <Link key={c.courseId} href={`/progress/${c.courseId}`} prefetch scroll={false} className={cx(s.rowCard, s.pressable)}>
              <Score value={c.fx ? "FX" : mark === null ? "—" : String(mark)} tier={t} label={`${c.name}: ${c.fx ? "FX" : mark ?? "no mark"}`} />
              <div className={s.lines}>
                <p className={s.t15sb}>{c.name}</p>
                <p className={cx(s.t12, s.soft)}>{[mark, c.fx ? "FX · resit" : c.passed ? "passed" : c.passed === false ? "not passed" : null].filter((x) => x !== null).join(" · ")}</p>
              </div>
            </Link>
          );
        })}
        {data.rate.waiting ? (
          <Link href="/rate" prefetch className={cx(s.card, s.warm, s.pressable, s.rateBig)}>
            <p className={cx(s.p0, s.rateTitle)}>Rate {data.rate.term ?? r.term}</p>
            <p className={cx(s.p0, s.t13m)}>
              {data.rate.waiting} {data.rate.waiting === 1 ? "course" : "courses"} · 30 seconds each · anonymous
            </p>
          </Link>
        ) : null}
      </div>
    </Screen>
  );
}
