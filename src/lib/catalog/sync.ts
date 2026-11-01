import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  catalogCache, faces, mentionLinks, mentions, ratings, respects, teacherAliases,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import type { School, Teacher } from "./types";

type Envelope<T> = { updated_at?: string; items?: T[]; next_offset?: number | null } & Record<string, unknown>;

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

async function save(key: string, data: unknown, updatedAt?: string) {
  const row = { key, data, sourceUpdatedAt: updatedAt ? new Date(updatedAt) : null, syncedAt: new Date() };
  await db().insert(catalogCache).values(row).onConflictDoUpdate({
    target: catalogCache.key,
    set: { data: sql`excluded.data`, sourceUpdatedAt: sql`excluded.source_updated_at`, syncedAt: sql`excluded.synced_at` },
  });
}

/** A broken build that returns almost nothing must not wipe the working copy. */
async function saveList(key: string, body: Envelope<unknown>) {
  const items = body.items ?? [];
  const [old] = await db().select().from(catalogCache).where(eq(catalogCache.key, key));
  const before = Array.isArray(old?.data) ? old.data.length : 0;
  if (before > 0 && items.length < before / 2) {
    throw new Error(`${key}: ${items.length} items, had ${before}`);
  }
  await save(key, items, body.updated_at);
  return items;
}

/**
 * Moves everything stored under an old teacher id to the current one. The first
 * time a teacher reaches the directory the id changes from name to email.
 * When a student rated both records, the newer rating survives.
 */
export async function mergeTeacherIds(teachers: Teacher[]) {
  const moved: string[] = [];
  await db().transaction(async (tx) => {
    for (const teacher of teachers) {
      const old = teacher.previous_ids.filter((id) => id !== teacher.id);
      if (!old.length) continue;
      for (const oldId of old) {
        await tx.insert(teacherAliases).values({ oldId, teacherId: teacher.id }).onConflictDoUpdate({
          target: teacherAliases.oldId,
          set: { teacherId: teacher.id },
        });
      }
      await tx.execute(sql`
        delete from ratings stale using ratings keep
        where stale.user_id = keep.user_id
          and stale.teacher_id in (${sql.join(old.map((id) => sql`${id}`), sql`, `)})
          and keep.teacher_id = ${teacher.id}
          and stale.updated_at <= keep.updated_at`);
      await tx.execute(sql`
        delete from ratings keep using ratings stale
        where stale.user_id = keep.user_id
          and stale.teacher_id in (${sql.join(old.map((id) => sql`${id}`), sql`, `)})
          and keep.teacher_id = ${teacher.id}`);
      const updated = await tx.update(ratings).set({ teacherId: teacher.id }).where(inArray(ratings.teacherId, old)).returning({ id: ratings.id });
      await tx.execute(sql`
        delete from respects stale using respects keep
        where stale.user_id = keep.user_id and keep.teacher_id = ${teacher.id}
          and stale.teacher_id in (${sql.join(old.map((id) => sql`${id}`), sql`, `)})`);
      await tx.update(respects).set({ teacherId: teacher.id }).where(inArray(respects.teacherId, old));
      const [face] = await tx.select().from(faces).where(eq(faces.teacherId, teacher.id));
      if (!face) await tx.update(faces).set({ teacherId: teacher.id }).where(inArray(faces.teacherId, old));
      if (updated.length) moved.push(teacher.id);
    }
  });
  return moved;
}

type ExportPost = {
  post_id: number; url: string; text: string; date: string | null;
  links: Array<{ kind: string; code?: string; teacher_id?: string }>;
};

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

/** A failed endpoint keeps its old copy and does not stop the others. */
export async function syncCatalog() {
  const failed: string[] = [];
  const task = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (error) {
      console.error(`Sync ${name} failed`, error);
      failed.push(name);
    }
  };

  await task("teachers", async () => {
    const teachers = (await saveList("teachers", await get<Teacher>("/api/faculty"))) as Teacher[];
    await mergeTeacherIds(teachers);
  });
  for (const [key, path] of [["courses", "/api/courses"], ["timetable", "/api/timetable"], ["groups", "/api/groups"]] as const) {
    await task(key, async () => { await saveList(key, await get(path)); });
  }
  await task("semesters", async () => {
    const body = await get("/api/semesters");
    await save("semesters", { current: body.current ?? null, next: body.next ?? null }, new Date().toISOString());
  });
  await task("schools", async () => {
    const body = await get<School>("/api/schools");
    const schools = (await saveList("schools", body)) as School[];
    for (const program of schools.flatMap((school) => school.programs)) {
      await task(`curriculum:${program.slug}`, async () => {
        const curriculum = await get(`/api/programs/${program.slug}/curriculum`);
        await save(`curriculum:${program.slug}`, curriculum, curriculum.updated_at);
      });
    }
  });
  if (env().MENTIONS_SYNC === "on") await task("mentions", syncMentions);

  return { failed };
}
