/**
 * A4 Reports · Links: which courses and professors the matcher tied to each
 * Anonymous post, so a moderator can take a wrong one off. Posts carry no
 * author here or anywhere else.
 */
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { MentionKind } from "@/core/mentions";
import { db } from "@/lib/db";
import { adminMarks, lmsCourses, mentionLinks, mentions, reports } from "@/lib/db/schema";
import { teachersByIds } from "@/server/views/shared";

export type LinkFilter = { q?: string; kind?: MentionKind; target?: string };
export type LinkChip = { kind: MentionKind; target: string; label: string; hidden: boolean };

const parseHidden = (key: string) => {
  const [postId, kind, ...rest] = key.split("|");
  return { postId: Number(postId), kind: kind as MentionKind, target: rest.join("|") };
};

export async function mentionLinksPage(filter: LinkFilter, limit = 100) {
  const q = filter.q?.trim().slice(0, 80) || undefined;
  const byTarget = filter.kind && filter.target ? and(eq(mentionLinks.kind, filter.kind), eq(mentionLinks.target, filter.target)) : undefined;
  const linked = db().selectDistinct({ postId: mentionLinks.postId }).from(mentionLinks).where(byTarget);
  const [posts, hiddenRows, totals, top] = await Promise.all([
    db()
      .select({ id: mentions.postId, url: mentions.url, text: mentions.text })
      .from(mentions)
      .where(and(inArray(mentions.postId, linked), q ? ilike(mentions.text, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : undefined))
      .orderBy(desc(mentions.postId))
      .limit(limit),
    db().select({ key: adminMarks.target, at: adminMarks.at }).from(adminMarks).where(eq(adminMarks.kind, "mention-link-hidden")).orderBy(desc(adminMarks.at)).limit(200),
    db().select({ kind: mentionLinks.kind, n: sql<number>`count(*)::int`, posts: sql<number>`count(distinct ${mentionLinks.postId})::int` }).from(mentionLinks).groupBy(mentionLinks.kind),
    db().execute<{ kind: string; target: string; posts: number }>(sql`
      select kind, target, posts from (
        select kind, target, count(*)::int as posts, row_number() over (partition by kind order by count(*) desc, target) as n
        from ${mentionLinks} group by kind, target
      ) t where n <= 12 order by kind, posts desc`),
  ]);
  const ids = posts.map((p) => p.id);
  const hidden = hiddenRows.map((r) => ({ ...parseHidden(r.key), at: r.at }));
  const links = ids.length ? await db().select().from(mentionLinks).where(inArray(mentionLinks.postId, ids)) : [];
  // Hidden links of the listed posts, plus the latest hidden ones anywhere (to undo).
  const recentHiddenPosts = [...new Set(hidden.map((h) => h.postId))].filter((id) => !ids.includes(id)).slice(0, 30);
  const extra = recentHiddenPosts.length
    ? await db().select({ id: mentions.postId, url: mentions.url, text: mentions.text }).from(mentions).where(inArray(mentions.postId, recentHiddenPosts))
    : [];

  const all = [...links.map((l) => ({ kind: l.kind as MentionKind, target: l.target })), ...hidden, ...top.rows.map((r) => ({ kind: r.kind as MentionKind, target: r.target })), ...(filter.kind && filter.target ? [{ kind: filter.kind, target: filter.target }] : [])];
  const codes = [...new Set(all.filter((l) => l.kind === "course").map((l) => l.target))];
  const teacherIds = [...new Set(all.filter((l) => l.kind === "teacher").map((l) => l.target))];
  const [courseNames, people] = await Promise.all([
    codes.length ? db().selectDistinct({ code: lmsCourses.code, name: lmsCourses.name }).from(lmsCourses).where(inArray(lmsCourses.code, codes)) : Promise.resolve([]),
    teachersByIds(teacherIds),
  ]);
  const label = (kind: MentionKind, target: string) =>
    kind === "course" ? `${target} · ${courseNames.find((c) => c.code === target)?.name ?? "unknown course"}` : people.get(target)?.name ?? `Professor ${target}`;

  const card = (p: { id: number; url: string; text: string }) => {
    const chips: LinkChip[] = [
      ...links.filter((l) => l.postId === p.id).map((l) => ({ kind: l.kind as MentionKind, target: l.target, label: label(l.kind as MentionKind, l.target), hidden: false })),
      ...hidden.filter((h) => h.postId === p.id).map((h) => ({ kind: h.kind, target: h.target, label: label(h.kind, h.target), hidden: true })),
    ];
    return { id: p.id, url: p.url, text: p.text, links: chips.sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label)) };
  };
  const count = (kind: MentionKind) => totals.find((t) => t.kind === kind) ?? { n: 0, posts: 0 };
  return {
    filter: { q: q ?? "", kind: filter.kind ?? null, target: filter.target ?? null, label: filter.kind && filter.target ? label(filter.kind, filter.target) : null },
    totals: { course: count("course").n, teacher: count("teacher").n, hidden: hidden.length },
    top: {
      course: top.rows.filter((r) => r.kind === "course").map((r) => ({ target: r.target, label: label("course", r.target), posts: r.posts })),
      teacher: top.rows.filter((r) => r.kind === "teacher").map((r) => ({ target: r.target, label: label("teacher", r.target), posts: r.posts })),
    },
    posts: posts.map(card),
    recentlyHidden: extra.sort((a, b) => b.id - a.id).map(card),
  };
}

/** The Open / Resolved tab counts, for the Links tab's header. */
export async function reportCounts() {
  const [row] = await db()
    .select({
      open: sql<number>`(count(distinct (${reports.targetKind}, ${reports.targetId})) filter (where ${reports.status} = 'open'))::int`,
      resolved: sql<number>`(count(distinct (${reports.targetKind}, ${reports.targetId})) filter (where ${reports.status} <> 'open'))::int`,
    })
    .from(reports);
  return { open: row?.open ?? 0, resolved: row?.resolved ?? 0 };
}
