import { isQuiet, QUIET_HOURS } from "@/core/notifications";
/**
 * Pure admin rules: automatic upload checks, report reasons, broadcast timing
 * and duplicate professors. No database access here, so it is unit-tested.
 */
import { DAY_MS, localDay, localMinutes, TZ_OFFSET_MS } from "@/core/time";

/* ───────── Upload checks ───────── */

/** What the bot stores in `uploads.checks` at intake. Every key is optional. */
export type UploadChecks = {
  lms?: { match?: string | null; score?: number | null } | null;
  duplicate?: string | boolean | null;
  exam?: { date?: string | null; running?: boolean } | null;
  personal?: string[] | boolean | null;
};

export type CheckLine = { ok: boolean; text: string };

export function checkLines(raw: Record<string, unknown>, courseName: string): CheckLine[] {
  const c = raw as UploadChecks;
  const lines: CheckLine[] = [];
  if (c.lms !== undefined) {
    const m = c.lms?.match;
    lines.push(m ? { ok: false, text: `Maybe in LMS: ${m}${c.lms?.score ? ` (${Math.round(c.lms.score * (c.lms.score <= 1 ? 100 : 1))}%)` : ""}` } : { ok: true, text: `Not in LMS files for ${courseName}` });
  }
  if (c.duplicate !== undefined) {
    lines.push(c.duplicate ? { ok: false, text: typeof c.duplicate === "string" ? `Same file as ${c.duplicate}` : "A copy of another student upload" } : { ok: true, text: "Not a copy of another student upload" });
  }
  if (c.exam !== undefined && c.exam) {
    lines.push(c.exam.running ? { ok: false, text: "The exam may still be running" } : { ok: true, text: c.exam.date ? `Exam was ${c.exam.date} — not running now` : "Exam is not running now" });
  }
  if (c.personal !== undefined) {
    const found = Array.isArray(c.personal) ? c.personal : c.personal ? ["personal data"] : [];
    lines.push(found.length ? { ok: false, text: `Found ${found.join(", ")}` } : { ok: true, text: "No phone numbers or student IDs found" });
  }
  return lines;
}

/** Queue flag next to a waiting upload: "In LMS?" or "Check". */
export function checkFlag(raw: Record<string, unknown>): "lms" | "check" | null {
  const c = raw as UploadChecks;
  if (c.lms?.match) return "lms";
  if (c.duplicate || c.exam?.running || (Array.isArray(c.personal) ? c.personal.length : c.personal)) return "check";
  return null;
}

/* ───────── Reports ───────── */

export const REPORT_REASONS: Record<string, { label: string; rule: string }> = {
  insult: { label: "Insult toward a teacher", rule: "Rule: critique the course, not the person." },
  untrue: { label: "Not true", rule: "Rule: say what happened; don't make things up." },
  personal: { label: "Personal data", rule: "Rule: no names of students, phone numbers or IDs." },
  cheating: { label: "Cheating", rule: "Rule: no help with exams or graded work while they run." },
  "exam-running": { label: "Exam still running", rule: "Rule: share exams only after they are over." },
  spam: { label: "Spam", rule: "Rule: posts are about courses and teachers." },
  "wrong-course": { label: "Wrong course", rule: "Rule: files go to the course they belong to." },
  other: { label: "Other", rule: "Rule: be fair to the next cohort." },
};

export const reasonLabel = (r: string) => REPORT_REASONS[r]?.label ?? r;
export const reasonShort = (r: string) => (REPORT_REASONS[r] ? REPORT_REASONS[r].label.split(" ")[0].toLowerCase() : r);

/** The rule shown for the most-reported reason of an item. */
export function ruleFor(reasons: Record<string, number>) {
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? REPORT_REASONS[top]?.rule ?? REPORT_REASONS.other.rule : REPORT_REASONS.other.rule;
}

export const MUTE_DAYS = 7;

/* ───────── Broadcasts ───────── */

export type Audience = { years?: number[]; schools?: string[]; courseIds?: string[]; unrated?: string };

/** One definition of quiet hours for the bot and broadcasts (Figma 8.5). */
export const QUIET_START = QUIET_HOURS.from;
export const QUIET_END = QUIET_HOURS.to;

export const inQuietHours = (at: Date) => isQuiet(localMinutes(at));

/** The first moment at or after `at` outside quiet hours (23:00–07:00 Tashkent). */
export function nextSendable(at: Date): Date {
  if (!inQuietHours(at)) return at;
  const m = localMinutes(at);
  const day = localDay(at);
  const base = Date.parse(`${day}T00:00:00Z`) - TZ_OFFSET_MS + QUIET_END * 60_000;
  return new Date(m >= QUIET_START ? base + DAY_MS : base);
}

/** Can two audiences reach the same student? Disjoint years are the only sure "no". */
export function audiencesOverlap(a: Audience, b: Audience) {
  if (a.years?.length && b.years?.length && !a.years.some((y) => b.years!.includes(y))) return false;
  return true;
}

/** One broadcast per student per day: the first scheduled one that clashes, if any. */
export function dayClash<T extends { sendAt: Date; audience: Audience }>(existing: T[], next: { sendAt: Date; audience: Audience }) {
  const day = localDay(next.sendAt);
  return existing.find((b) => localDay(b.sendAt) === day && audiencesOverlap(b.audience, next.audience)) ?? null;
}

export function audienceLabel(a: Audience) {
  const parts = [
    ...(a.years ?? []).map((y) => `Year ${y}`),
    ...(a.schools ?? []),
    ...(a.courseIds ?? []).map((c) => `Taking ${c}`),
    ...(a.unrated ? [`Haven't rated ${a.unrated}`] : []),
  ];
  return parts.length ? parts.join(" · ") : "Everyone";
}

/* ───────── Professors ───────── */

export const foldName = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]/g, "");

/** Teachers that are probably the same person: same surname and first initial, spelled with or without accents. */
export function twinKey(t: { firstName: string | null; lastName: string | null }) {
  const last = foldName(t.lastName);
  const first = foldName(t.firstName);
  return last && first ? `${last}|${first[0]}` : null;
}

export function twins<T extends { id: string; firstName: string | null; lastName: string | null }>(teachers: T[], skip: Set<string> = new Set()) {
  const groups = new Map<string, T[]>();
  for (const t of teachers) {
    const k = twinKey(t);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const pairs: Array<[T, T]> = [];
  for (const g of groups.values()) {
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        const key = [g[i].id, g[j].id].sort().join("|");
        if (!skip.has(key)) pairs.push([g[i], g[j]]);
      }
  }
  return pairs;
}

/* ───────── People ───────── */

/** Year of study from the number of semesters in the LMS transcript. */
export const yearOf = (semesters: number | null | undefined) => (semesters ? Math.max(1, Math.ceil(semesters / 2)) : null);
