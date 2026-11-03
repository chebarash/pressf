/**
 * Who a broadcast reaches, and the in-app banner a student sees: the
 * maintenance notice (A10) or a broadcast's banner until `bannerUntil` (9.4).
 */
import { and, desc, eq, gt, isNotNull, lte } from "drizzle-orm";
import { yearOf, type Audience } from "@/server/admin/rules";
import { db } from "@/lib/db";
import { broadcasts, courseRatings, lmsCache } from "@/lib/db/schema";
import { DECISION_TAGS, settingIsOn } from "./decisions";
import { pseudonym } from "./identity";
import { publicCache } from "./views/cache";

type CacheData = { profile?: { semesters?: unknown[] } | null; enrollment?: { codes?: string[] } | null };

/** What a broadcast audience is matched against, from the student's sign-in cache. */
export type AudiencePerson = { year: number | null; codes: string[]; rated: (term: string) => boolean };

export const personOf = (data: unknown, rated: AudiencePerson["rated"] = () => false): AudiencePerson => {
  const d = data as CacheData | null;
  return { year: yearOf(d?.profile?.semesters?.length ?? null), codes: d?.enrollment?.codes ?? [], rated };
};

/**
 * Same rules as the admin's audience count: years and courses must match when
 * given, "haven't rated" leaves out students who rated that term. Schools are
 * not known per student yet, so they do not narrow the audience.
 */
export function audienceMatches(a: Audience, p: AudiencePerson) {
  if (a.years?.length && (!p.year || !a.years.includes(p.year))) return false;
  if (a.courseIds?.length && !p.codes.some((c) => a.courseIds!.includes(c))) return false;
  if (a.unrated && p.rated(a.unrated)) return false;
  return true;
}

/** Raters (pseudonyms) who rated in a term, for "haven't rated" audiences. */
export async function ratersOf(term: string) {
  const rows = await db().selectDistinct({ rater: courseRatings.rater }).from(courseRatings).where(eq(courseRatings.term, term));
  return new Set(rows.map((r) => r.rater));
}

export const BROADCASTS_TAG = "broadcasts";

/** Broadcasts whose banner is showing now (sent or sending, before `bannerUntil`). Cached for a minute. */
const liveBanners = publicCache(
  "broadcast-banners",
  async (nowIso: string) => {
    const now = new Date(nowIso);
    const rows = await db()
      .select({ id: broadcasts.id, text: broadcasts.text, button: broadcasts.button, audience: broadcasts.audience, until: broadcasts.bannerUntil })
      .from(broadcasts)
      .where(and(isNotNull(broadcasts.bannerUntil), gt(broadcasts.bannerUntil, now), lte(broadcasts.sendAt, now)))
      .orderBy(desc(broadcasts.sendAt))
      .limit(5);
    return rows.map((r) => ({ ...r, until: r.until!.toISOString() }));
  },
  () => [BROADCASTS_TAG, DECISION_TAGS.marks],
  60,
);

export type ShellBanner = { id: string; tone: "info" | "warning"; text: string; action: { label: string; href: string } | null };

export const MAINTENANCE_TEXT = "Press F is updating, back in a few minutes";

/** The one banner the frame shows: maintenance first, then the newest broadcast banner for this student. */
export async function shellBanner(userId: string | null, now = new Date()): Promise<ShellBanner | null> {
  if (await settingIsOn("maintenance")) return { id: "maintenance", tone: "warning", text: MAINTENANCE_TEXT, action: null };
  // Minute resolution keeps the cache key stable across requests.
  const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
  const live = (await liveBanners(minute)).filter((b) => Date.parse(b.until) > now.getTime());
  if (!live.length || !userId) return null;
  const [row] = await db().select({ data: lmsCache.data }).from(lmsCache).where(eq(lmsCache.userId, userId));
  const raters = new Map<string, Set<string>>();
  const me = pseudonym(userId, "rater");
  for (const b of live) {
    if (b.audience.unrated && !raters.has(b.audience.unrated)) raters.set(b.audience.unrated, await ratersOf(b.audience.unrated));
    const person = personOf(row?.data, (term) => raters.get(term)?.has(me) ?? false);
    if (audienceMatches(b.audience, person)) return { id: `broadcast:${b.id}`, tone: "info", text: b.text, action: b.button ? { label: b.button.label, href: b.button.target } : null };
  }
  return null;
}
