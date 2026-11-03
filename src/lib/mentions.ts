import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { mentionLinks, mentions } from "@/lib/db/schema";
import { env } from "@/lib/env";

/**
 * Posts from the students' Anonymous channel that mention a course or a
 * professor, copied from the channel bot's API. Course and professor pages
 * show them (src/server/views/shared.ts, mentionsOf).
 */

type Envelope<T> = { items?: T[]; next_offset?: number | null };

type ExportPost = {
  post_id: number; url: string; text: string; date: string | null;
  links: Array<{ kind: string; code?: string; teacher_id?: string }>;
};

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

export async function syncMentions() {
  let offset: number | null = 0;
  while (offset !== null) {
    const params = new URLSearchParams({ limit: "500", offset: String(offset) });
    const body: Envelope<ExportPost> = await get<ExportPost>(`/api/mentions/export?${params}`, 120_000);
    for (const post of body.items ?? []) {
      const row = { postId: post.post_id, url: post.url, text: post.text, date: post.date ? new Date(post.date) : null };
      await db().insert(mentions).values(row).onConflictDoUpdate({ target: mentions.postId, set: { url: row.url, text: row.text, date: row.date } });
      await db().delete(mentionLinks).where(eq(mentionLinks.postId, post.post_id));
      const links = post.links.flatMap((link) => {
        const target = link.code ?? link.teacher_id;
        return target ? [{ postId: post.post_id, kind: link.teacher_id ? "teacher" : "course", target }] : [];
      });
      if (links.length) await db().insert(mentionLinks).values(links).onConflictDoNothing();
    }
    offset = body.next_offset ?? null;
  }
  await dropDeletedPosts();
}

/** `since` cannot show deletions, so whatever the channel no longer has goes. */
async function dropDeletedPosts() {
  const live = new Set((await get<number>("/api/posts/ids")).items ?? []);
  const stored = await db().select({ postId: mentions.postId }).from(mentions);
  const gone = stored.map((row) => row.postId).filter((id) => !live.has(id));
  if (gone.length > stored.length / 2) throw new Error(`Refusing to delete ${gone.length} of ${stored.length} posts`);
  if (gone.length) await db().delete(mentions).where(inArray(mentions.postId, gone));
}

/** The nightly job: copies the Anonymous posts while MENTIONS_SYNC is on. */
export async function nightlySync() {
  const failed: string[] = [];
  if (env().MENTIONS_SYNC === "on") {
    try {
      await syncMentions();
    } catch (error) {
      console.error("Sync mentions failed", error);
      failed.push("mentions");
    }
  }
  return { failed };
}
