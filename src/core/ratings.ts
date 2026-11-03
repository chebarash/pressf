/**
 * The rating model (research-based, short): one required question — would you
 * recommend the course — plus optional hours a week, difficulty, a few tags,
 * and per-teacher "Press F" (would take again) with tags. Numbers are shown
 * only from MIN_RATINGS answers so a single student cannot be identified or
 * skew the result.
 */

export const MIN_RATINGS = 5;

export const RECOMMEND = ["yes", "unsure", "no"] as const;
export type Recommend = (typeof RECOMMEND)[number];

/** Hours a week outside class (Figma D5): "< 2", "2–5", "5–10", "10+", answered with keys 1–4. */
export const HOURS = ["0-2", "2-5", "5-10", "10+"] as const;
export type Hours = (typeof HOURS)[number];
/** Bucket midpoints for the summary median ("≈ N h"). */
export const HOURS_MID: Record<Hours, number> = { "0-2": 1, "2-5": 3.5, "5-10": 7.5, "10+": 12 };
/** How each bucket is printed on the rate forms, mobile and desktop. */
export const HOURS_LABEL: Record<Hours, string> = { "0-2": "< 2", "2-5": "2–5", "5-10": "5–10", "10+": "10+" };
export const isHours = (v: unknown): v is Hours => typeof v === "string" && (HOURS as readonly string[]).includes(v);
/** A stored hours value as a current bucket; anything unknown reads as unanswered. */
export const toHours = (v: string | null | undefined): Hours | null => (v == null ? null : isHours(v) ? v : null);

export const COURSE_TAGS = ["Exam follows lectures", "Useful later", "Fair exams", "Heavy reading", "Lots of group work", "Strict attendance"] as const;
export const TEACHER_TAGS = ["Explains clearly", "Answers questions", "Grades fairly", "Quick feedback", "Strict about attendance", "Reads from slides"] as const;
export type CourseTag = (typeof COURSE_TAGS)[number];
/** The order the rate forms show course stickers in (Figma 4.11 and D5). */
export const COURSE_TAG_ORDER: readonly CourseTag[] = ["Exam follows lectures", "Useful later", "Heavy reading", "Lots of group work", "Strict attendance", "Fair exams"];
export type TeacherTag = (typeof TEACHER_TAGS)[number];
export const MAX_TAGS = 3;

export type TeacherRole = "lecture" | "tutorial" | "lab" | "practice" | "other";

export type TeacherAnswer = { teacherId: string; role: TeacherRole; pressF: boolean | null; tags: TeacherTag[] };

export type RatingInput = {
  recommend: Recommend | null;
  hours: Hours | null;
  difficulty: 1 | 2 | 3 | 4 | 5 | null;
  tags: CourseTag[];
  teachers: TeacherAnswer[];
};

export type RatingIssue = "recommend-required" | "bad-hours" | "too-many-tags" | "unknown-tag" | "bad-difficulty" | "duplicate-teacher";

/** Only "would you recommend it?" is required; everything else may be skipped. */
export function validateRating(r: RatingInput): RatingIssue[] {
  const issues: RatingIssue[] = [];
  if (!r.recommend || !RECOMMEND.includes(r.recommend)) issues.push("recommend-required");
  if (r.hours !== null && !isHours(r.hours)) issues.push("bad-hours");
  if (r.difficulty !== null && !(Number.isInteger(r.difficulty) && r.difficulty >= 1 && r.difficulty <= 5)) issues.push("bad-difficulty");
  const tagSets: Array<[readonly string[], readonly string[]]> = [[r.tags, COURSE_TAGS], ...r.teachers.map((t) => [t.tags, TEACHER_TAGS] as [readonly string[], readonly string[]])];
  for (const [tags, allowed] of tagSets) {
    if (tags.length > MAX_TAGS) issues.push("too-many-tags");
    if (tags.some((t) => !allowed.includes(t))) issues.push("unknown-tag");
  }
  const ids = r.teachers.map((t) => `${t.teacherId}:${t.role}`);
  if (new Set(ids).size !== ids.length) issues.push("duplicate-teacher");
  return [...new Set(issues)];
}

export const canSubmit = (r: RatingInput) => validateRating(r).length === 0;

/** A stored rating, as read back for aggregation. */
export type StoredRating = RatingInput & { term: string; courseId: string };

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** "Fall 2025" → sortable number; Spring < Summer < Fall within a year. */
export const termKey = (term: string) => Number(term.match(/\d{4}/)?.[0] ?? 0) * 10 + ({ Spring: 1, Summer: 2, Fall: 3 }[term.split(" ")[0]] ?? 0);

export type TagShare<T extends string> = { tag: T; pct: number };

function topTags<T extends string>(lists: T[][], n: number, limit = 4): TagShare<T>[] {
  const counts = new Map<T, number>();
  for (const l of lists) for (const t of l) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([tag, c]) => ({ tag, pct: pct(c, n) })).filter((t) => t.pct >= 20).sort((a, b) => b.pct - a.pct).slice(0, limit);
}

export type TrendPoint = { term: string; value: number; count: number };

function trend(rows: Array<{ term: string; hit: boolean }>): TrendPoint[] {
  const by = new Map<string, { n: number; hits: number }>();
  for (const r of rows) {
    const t = by.get(r.term) ?? { n: 0, hits: 0 };
    t.n++;
    if (r.hit) t.hits++;
    by.set(r.term, t);
  }
  return [...by.entries()].filter(([, v]) => v.n >= MIN_RATINGS).sort(([a], [b]) => termKey(a) - termKey(b)).map(([term, v]) => ({ term, value: pct(v.hits, v.n), count: v.n }));
}

export type CourseSummary =
  | { enough: false; count: number }
  | {
      enough: true;
      count: number;
      recommendPct: number;
      /** Median hours a week outside class, e.g. 6. */
      hours: number | null;
      /** Average difficulty 1–5, one decimal. */
      difficulty: number | null;
      tags: TagShare<CourseTag>[];
      trend: TrendPoint[];
      /** Change vs. the earliest semester on the trend, in points. */
      delta: number | null;
    };

export function summarizeCourse(rows: StoredRating[]): CourseSummary {
  const valid = rows.filter((r) => r.recommend);
  const n = valid.length;
  if (n < MIN_RATINGS) return { enough: false, count: n };
  const hours = median(valid.flatMap((r) => {
    const h = toHours(r.hours);
    return h ? [HOURS_MID[h]] : [];
  }));
  const diffs = valid.flatMap((r) => (r.difficulty ? [r.difficulty] : []));
  const t = trend(valid.map((r) => ({ term: r.term, hit: r.recommend === "yes" })));
  return {
    enough: true,
    count: n,
    recommendPct: pct(valid.filter((r) => r.recommend === "yes").length, n),
    hours,
    difficulty: diffs.length ? Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10 : null,
    tags: topTags(valid.map((r) => r.tags), n),
    trend: t,
    delta: t.length >= 2 ? t[t.length - 1].value - t[0].value : null,
  };
}

export type TeacherSummary =
  | { enough: false; count: number }
  | {
      enough: true;
      count: number;
      /** Share who would take the teacher again ("pressed F"). */
      pressFPct: number;
      tags: TagShare<TeacherTag>[];
      byCourse: Array<{ courseId: string; role: TeacherRole; pct: number; count: number }>;
      trend: TrendPoint[];
      delta: number | null;
    };

export function summarizeTeacher(teacherId: string, rows: StoredRating[]): TeacherSummary {
  const answers = rows.flatMap((r) => r.teachers.filter((t) => t.teacherId === teacherId && t.pressF !== null).map((t) => ({ ...t, term: r.term, courseId: r.courseId })));
  const n = answers.length;
  if (n < MIN_RATINGS) return { enough: false, count: n };
  const groups = new Map<string, typeof answers>();
  for (const a of answers) groups.set(`${a.courseId}|${a.role}`, [...(groups.get(`${a.courseId}|${a.role}`) ?? []), a]);
  const t = trend(answers.map((a) => ({ term: a.term, hit: !!a.pressF })));
  return {
    enough: true,
    count: n,
    pressFPct: pct(answers.filter((a) => a.pressF).length, n),
    tags: topTags(answers.map((a) => a.tags), n),
    byCourse: [...groups.values()]
      .filter((g) => g.length >= MIN_RATINGS)
      .map((g) => ({ courseId: g[0].courseId, role: g[0].role, pct: pct(g.filter((a) => a.pressF).length, g.length), count: g.length }))
      .sort((a, b) => b.pct - a.pct),
    trend: t,
    delta: t.length >= 2 ? t[t.length - 1].value - t[0].value : null,
  };
}

/** "≈ 6 h" / "4/5" labels for the summary strip. */
export const hoursLabel = (h: number | null) => (h === null ? "—" : `${Math.round(h)} h`);
export const difficultyWord = (d: number | null) => (d === null ? "—" : d < 2 ? "Easy" : d < 2.8 ? "Manageable" : d < 3.6 ? "Hard-ish" : d < 4.4 ? "Hard" : "Very hard");

/** Ratings can be changed until the end of the semester after the one rated. */
export function canEdit(ratedTerm: string, currentTerm: string) {
  // Count Spring and Fall only: Fall 2025 → Spring 2026 is one step, summer in between does not count.
  const ord = (t: string) => Number(t.match(/\d{4}/)?.[0] ?? 0) * 2 + (t.startsWith("Fall") ? 1 : 0);
  return ord(currentTerm) - ord(ratedTerm) <= 1;
}

/** Past courses the student has not rated yet, newest semester first. */
export function rateQueue<T extends { courseId: string; term: string }>(taken: T[], rated: Set<string>, currentTerm: string) {
  return taken.filter((c) => termKey(c.term) < termKey(currentTerm) && !rated.has(`${c.courseId}|${c.term}`)).sort((a, b) => termKey(b.term) - termKey(a.term));
}

/**
 * How loud the rating ask is: it grows with each dismissal and with time since
 * grades came out, and never disappears while courses are waiting.
 */
export function askLevel(waiting: number, dismissals: number, daysSinceGrades: number): "none" | "card" | "banner" | "shine" {
  if (waiting === 0) return "none";
  if (daysSinceGrades >= 14 || dismissals >= 3) return "shine";
  if (daysSinceGrades >= 3 || dismissals >= 1) return "banner";
  return "card";
}
