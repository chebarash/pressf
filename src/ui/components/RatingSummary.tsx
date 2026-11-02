import { cx } from "./cx";
import { CHART, trendPoints } from "./rating-geometry";
import s from "./RatingSummary.module.css";

export type SummaryStat = {
  value: string;
  label: string;
  /** accent = teal (% recommend), low = brown (hard), default ink. */
  tone?: "accent" | "low" | "default";
};

export type RatingSummaryProps = {
  /** "By 63 students · Fall 2024 – Fall 2026". */
  byline: string;
  /** Three numbers, e.g. 84% recommend · 6 h a week · 4/5 hard. */
  stats: SummaryStat[];
  /** "Recommend by semester" line chart; needs 2+ points. */
  trend?: { title: string; delta?: string; points: Array<{ label: string; value: number }> };
  /** Top tags with share, as stickers. */
  tags?: Array<{ label: string; pct: number }>;
  /** Professor only: % by course and role. */
  byCourse?: Array<{ label: string; pct: number }>;
  byCourseTitle?: string;
  className?: string;
};

const TINTS = ["teal", "mustard", "plum"] as const;

/** Rating summary card (Figma App/RatingSummary 4192:7566, Kind=Course / Professor). Show only from 5 ratings. */
export function RatingSummary({ byline, stats, trend, tags, byCourse, byCourseTitle = "By course and role", className }: RatingSummaryProps) {
  return (
    <section className={cx(s.card, className)}>
      <p className={s.caption}>{byline}</p>
      <div className={s.numbers}>
        {stats.map((st) => (
          <div key={st.label} className={s.stat}>
            <span className={cx(s.value, st.tone === "accent" && s.accent, st.tone === "low" && s.low)}>{st.value}</span>
            <span className={s.label}>{st.label}</span>
          </div>
        ))}
      </div>
      {trend && trend.points.length > 1 ? <Trend {...trend} /> : null}
      {tags?.length ? (
        <ul className={s.stickers}>
          {tags.map((t, i) => (
            <li key={t.label} className={cx(s.sticker, s[TINTS[i % TINTS.length]])}>
              <span className={s.tagName}>{t.label}</span>
              <span className={s.tagPct}>{t.pct}%</span>
            </li>
          ))}
        </ul>
      ) : null}
      {byCourse?.length ? (
        <>
          <p className={s.caption}>{byCourseTitle}</p>
          <ul className={s.leaders}>
            {byCourse.map((r) => (
              <li key={r.label} className={s.leader}>
                <span>{r.label}</span>
                <span className={s.dots} aria-hidden />
                <span className={s.leaderPct}>{r.pct}%</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function Trend({ title, delta, points }: NonNullable<RatingSummaryProps["trend"]>) {
  const pts = trendPoints(points.map((p) => p.value));
  const last = pts.length - 1;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[last].x.toFixed(1)} ${CHART.baseline} L${pts[0].x.toFixed(1)} ${CHART.baseline} Z`;
  return (
    <div className={s.trend}>
      <div className={s.trendHead}>
        <p className={s.caption}>{title}</p>
        {delta ? <span className={s.delta}>{delta}</span> : null}
      </div>
      <div className={s.chart}>
        <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} preserveAspectRatio="none" className={s.chartSvg} role="img" aria-label={`${title}: ${points.map((p) => `${p.label} ${p.value}%`).join(", ")}`}>
          <line x1="0" x2={CHART.width} y1={CHART.baseline + 0.5} y2={CHART.baseline + 0.5} className={s.axis} />
          <path d={area} className={s.area} />
          <path d={line} className={s.line} />
        </svg>
        {pts.map((p, i) => (
          <span key={i} className={cx(s.dot, i === last && s.dotLast)} style={{ left: `${(p.x / CHART.width) * 100}%`, top: p.y }} />
        ))}
        {[0, last].map((i) => (
          <span key={`v${i}`} className={cx(s.pointValue, i === last && s.current)} style={{ left: `${(pts[i].x / CHART.width) * 100}%`, top: pts[i].y - 18 }}>
            {points[i].value}%
          </span>
        ))}
        {points.map((p, i) => (
          <span key={`l${i}`} className={cx(s.tick, i === last && s.current)} style={{ left: `${(pts[i].x / CHART.width) * 100}%` }}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
