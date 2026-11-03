import { and, eq, inArray, sql } from "drizzle-orm";
import { compileMatcher, linkKey, type Matcher, type MentionKind } from "@/core/mentions";
import { db } from "@/lib/db";
import { adminMarks, lmsCourses, lmsTeachers, mentionLinks, mentions, teacherAliases, teacherOverrides } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { invalidate, TAGS } from "@/server/views/cache";

/**
 * Every post of the students' Anonymous channel, copied from the channel bot's
 * API, and the courses and professors each one talks about. The bot only keeps
 * the posts; Press F finds the links itself (src/core/mentions.ts). Course and
 * professor pages show them (src/server/views/shared.ts, mentionsOf).
 */

type Envelope<T> = { items?: T[]; next_offset?: number | null };
type ExportPost = { post_id: number; url: string; text: string | null; date: string | null };

const BATCH = 1000;

async function get<T>(path: string, timeout = 30_000): Promise<Envelope<T>> {
  const { BOT_API_URL, BOT_API_TOKEN } = env();
  const response = await fetch(`${BOT_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${BOT_API_TOKEN}` },
    cache: "no-store",
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`Bot API ${path}: ${response.status}`);
  return response.json();
}

const chunks = <T>(list: T[], size = BATCH) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/** One matcher per run: every course and teacher, merges and admin display names folded in. */
export async function loadMatcher(): Promise<Matcher> {
  const [courses, teachers, aliases, overrides] = await Promise.all([
    db().selectDistinct({ code: lmsCourses.code, name: lmsCourses.name }).from(lmsCourses),
    db().select({ id: lmsTeachers.id, firstName: lmsTeachers.firstName, lastName: lmsTeachers.lastName, surName: lmsTeachers.surName }).from(lmsTeachers),
    db().select().from(teacherAliases),
    db().select({ id: teacherOverrides.teacherId, name: teacherOverrides.name }).from(teacherOverrides),
  ]);
  const shown = new Map(overrides.filter((o) => o.name?.trim()).map((o) => [o.id, o.name]));
  return compileMatcher({
    courses,
    teachers: teachers.map((t) => ({ ...t, displayName: shown.get(t.id) ?? null })),
    aliases: Object.fromEntries(aliases.map((a) => [a.oldId, a.teacherId])),
  });
}

/** Links an admin took off ("post|kind|target"); a re-match never brings them back. */
async function hiddenLinks(): Promise<Set<string>> {
  const rows = await db().select({ target: adminMarks.target }).from(adminMarks).where(eq(adminMarks.kind, "mention-link-hidden"));
  return new Set(rows.map((r) => r.target));
}

/**
 * Re-matches the given posts: their links are replaced in one go, minus hidden
 * ones, and each post records the matcher that made them. Returns the course
 * and teacher targets whose pages changed.
 */
async function relink(posts: Array<{ postId: number; text: string }>, matcher: Matcher, hidden: Set<string>, touched = new Set<string>()) {
  for (const part of chunks(posts)) {
    const ids = part.map((p) => p.postId);
    const links = part.flatMap((p) =>
      matcher.match(p.text)
        .filter((l) => !hidden.has(linkKey(p.postId, l.kind, l.target)))
        .map((l) => ({ postId: p.postId, kind: l.kind, target: l.target })),
    );
    await db().transaction(async (tx) => {
      const old = await tx.delete(mentionLinks).where(inArray(mentionLinks.postId, ids)).returning({ postId: mentionLinks.postId, kind: mentionLinks.kind, target: mentionLinks.target });
      if (links.length) await tx.insert(mentionLinks).values(links).onConflictDoNothing();
      await tx.update(mentions).set({ matchedWith: matcher.fingerprint }).where(inArray(mentions.postId, ids));
      // Only pages whose set of posts changed need a fresh render.
      const before = new Set(old.map((l) => `${l.postId}|${l.kind}|${l.target}`));
      const after = new Set(links.map((l) => `${l.postId}|${l.kind}|${l.target}`));
      for (const l of [...old, ...links]) {
        const k = `${l.postId}|${l.kind}|${l.target}`;
        if (before.has(k) !== after.has(k)) touched.add(`${l.kind}|${l.target}`);
      }
    });
  }
  return touched;
}

export type MentionsSyncResult = {
  posts: number;
  added: number;
  changed: number;
  removed: number;
  /** Posts matched again this run (new, edited, or matched by an older matcher). */
  rematched: number;
  links: { course: number; teacher: number };
  top: { course: Array<{ target: string; posts: number }>; teacher: Array<{ target: string; posts: number }> };
  ms: number;
};

export async function syncMentions(): Promise<MentionsSyncResult> {
  const started = Date.now();
  const [matcher, hidden] = await Promise.all([loadMatcher(), hiddenLinks()]);

  // 1. Every post the bot has.
  const incoming = new Map<number, ExportPost>();
  let offset: number | null = 0;
  while (offset !== null) {
    const params = new URLSearchParams({ limit: "500", offset: String(offset) });
    const body: Envelope<ExportPost> = await get<ExportPost>(`/api/mentions/export?${params}`, 120_000);
    for (const post of body.items ?? []) if (Number.isInteger(post.post_id) && post.url) incoming.set(post.post_id, post);
    offset = body.next_offset ?? null;
  }

  // 2. Store new and edited posts, in batches.
  const stored = new Map((await db().select({ postId: mentions.postId, url: mentions.url, text: mentions.text, date: mentions.date, matchedWith: mentions.matchedWith }).from(mentions)).map((r) => [r.postId, r]));
  const writes: Array<typeof mentions.$inferInsert> = [];
  let added = 0;
  for (const post of incoming.values()) {
    const row = { postId: post.post_id, url: post.url, text: post.text ?? "", date: post.date ? new Date(post.date) : null };
    const was = stored.get(row.postId);
    if (!was) added++;
    else if (was.url === row.url && was.text === row.text && (was.date?.getTime() ?? null) === (row.date?.getTime() ?? null)) continue;
    // A new or edited post is matched below.
    writes.push({ ...row, matchedWith: null });
  }
  for (const part of chunks(writes, 500)) {
    await db().insert(mentions).values(part).onConflictDoUpdate({
      target: mentions.postId,
      set: { url: sql`excluded.url`, text: sql`excluded.text`, date: sql`excluded.date`, matchedWith: sql`excluded.matched_with` },
    });
  }

  // 3. Match what is new, edited, or was matched by another matcher (new rules, courses or teachers: a full pass).
  const fresh = new Set(writes.map((w) => w.postId));
  const due: Array<{ postId: number; text: string }> = [];
  for (const post of incoming.values()) {
    const was = stored.get(post.post_id);
    if (fresh.has(post.post_id) || was?.matchedWith !== matcher.fingerprint) due.push({ postId: post.post_id, text: post.text ?? "" });
  }
  const touched = await relink(due, matcher, hidden);

  // 4. Whatever the channel no longer has goes.
  const removed = await dropDeletedPosts();

  if (touched.size || removed) {
    invalidate(...[...touched].map((k) => {
      const [kind, target] = k.split("|");
      return kind === "course" ? TAGS.course(target) : TAGS.teacher(target);
    }));
  }
  const [totals, top] = await Promise.all([
    db().select({ kind: mentionLinks.kind, n: sql<number>`count(*)::int` }).from(mentionLinks).groupBy(mentionLinks.kind),
    db().execute<{ kind: string; target: string; posts: number }>(sql`
      select kind, target, posts from (
        select kind, target, count(*)::int as posts, row_number() over (partition by kind order by count(*) desc, target) as n
        from ${mentionLinks} group by kind, target
      ) t where n <= 10 order by kind, posts desc`),
  ]);
  const total = (kind: MentionKind) => totals.find((t) => t.kind === kind)?.n ?? 0;
  const topOf = (kind: MentionKind) => top.rows.filter((r) => r.kind === kind).map((r) => ({ target: r.target, posts: r.posts }));
  return {
    posts: incoming.size,
    added,
    changed: writes.length - added,
    removed,
    rematched: due.length,
    links: { course: total("course"), teacher: total("teacher") },
    top: { course: topOf("course"), teacher: topOf("teacher") },
    ms: Date.now() - started,
  };
}

/** The export cannot show deletions, so whatever the channel no longer has goes. */
async function dropDeletedPosts() {
  const live = new Set((await get<number>("/api/posts/ids")).items ?? []);
  const stored = await db().select({ postId: mentions.postId }).from(mentions);
  const gone = stored.map((row) => row.postId).filter((id) => !live.has(id));
  if (gone.length > stored.length / 2) throw new Error(`Refusing to delete ${gone.length} of ${stored.length} posts`);
  for (const part of chunks(gone)) await db().delete(mentions).where(inArray(mentions.postId, part));
  return gone.length;
}

/** Matches some posts again right away (an admin restored a link). */
export async function rematchPosts(postIds: number[]) {
  if (!postIds.length) return new Set<string>();
  const [matcher, hidden, rows] = await Promise.all([
    loadMatcher(),
    hiddenLinks(),
    db().select({ postId: mentions.postId, text: mentions.text }).from(mentions).where(inArray(mentions.postId, postIds)),
  ]);
  return relink(rows, matcher, hidden);
}

/** Removes one link from a post at once (the admin hid it). */
export async function dropLink(postId: number, kind: MentionKind, target: string) {
  await db().delete(mentionLinks).where(and(eq(mentionLinks.postId, postId), eq(mentionLinks.kind, kind), eq(mentionLinks.target, target)));
}

/** The nightly job: copies the Anonymous posts while MENTIONS_SYNC is on. */
export async function nightlySync() {
  const failed: string[] = [];
  let mentionsResult: MentionsSyncResult | undefined;
  if (env().MENTIONS_SYNC === "on") {
    try {
      mentionsResult = await syncMentions();
    } catch (error) {
      console.error("Sync mentions failed", error);
      failed.push("mentions");
    }
  }
  return { failed, ...(mentionsResult ? { mentions: mentionsResult } : {}) };
}
