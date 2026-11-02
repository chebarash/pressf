/** Line icons from the Figma icon set (24 grid, 2.5 stroke), drawn in currentColor. */
const PATHS = {
  book: ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z", "M4 19.5V22h16v-5"],
  calendar: ["M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", "M8 2v4M16 2v4M4 10h16"],
  check: ["M20 6 9 17l-5-5"],
  "chevron-right": ["m9 18 6-6-6-6"],
  "chevron-left": ["m15 18-6-6 6-6"],
  "chevron-down": ["m6 9 6 6 6-6"],
  clock: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z", "M12 6v6l4 2"],
  file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z", "M14 2v6h6"],
  mail: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", "m22 7-10 6L2 7"],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"],
  pin: ["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z", "M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"],
  search: ["M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z", "m21 21-4.3-4.3"],
  send: ["M22 2 11 13", "M22 2 15 22l-4-9-9-4 20-7Z"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  external: ["M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", "M15 3h6v6", "M10 14 21 3"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5", "M12 15V3"],
  "arrow-up": ["M12 19V5", "m5 12 7-7 7 7"],
  x: ["M18 6 6 18", "m6 6 12 12"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className} style={{ flex: "none" }}>
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** The LMS book glyph used as a file source marker (14 px). */
export const SourceIcon = ({ source }: { source: "lms" | "students" | "channel" }) =>
  source === "lms" ? <Icon name="book" size={14} /> : <Icon name="send" size={14} />;

/** Recommend share ring: teal arc for "yes", mustard and rust for the rest. */
export function Ring({ pct, size = 20 }: { pct: number; size?: number }) {
  const r = 7.5;
  const c = 2 * Math.PI * r;
  const yes = Math.max(0, Math.min(100, pct)) / 100;
  const rest = 1 - yes;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden style={{ flex: "none", transform: "rotate(-90deg)" }}>
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--bg-danger)" strokeWidth="5" />
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--rating-mid)" strokeWidth="5" strokeDasharray={`${c * rest * 0.6} ${c}`} strokeDashoffset={-c * yes} />
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--rating-high)" strokeWidth="5" strokeDasharray={`${c * yes} ${c}`} />
    </svg>
  );
}
