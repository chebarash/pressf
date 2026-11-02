import { ringArcs, type Split } from "./rating-geometry";

const COLOR = { yes: "var(--rating-high)", unsure: "var(--rating-mid)", no: "var(--bg-danger)" } as const;

/**
 * Donut of yes / unsure / no (Figma "Ring" in App/CourseCard and App/RatingStrip).
 * `thickness` is the ring width as a share of the radius (CourseCard 0.5, RatingStrip 0.55).
 */
export function RatingRing({ split, size = 20, thickness = 0.5 }: { split: Split | number; size?: number; thickness?: number }) {
  const R = size / 2;
  const w = R * thickness;
  const r = R - w / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ flex: "none", transform: "rotate(-90deg)" }}>
      {ringArcs(split).map((a) =>
        a.pct > 0 ? (
          <circle
            key={a.key}
            cx={R}
            cy={R}
            r={r}
            fill="none"
            stroke={COLOR[a.key]}
            strokeWidth={w}
            strokeDasharray={`${(a.pct / 100) * c} ${c}`}
            strokeDashoffset={-(a.start / 100) * c}
          />
        ) : null,
      )}
    </svg>
  );
}
