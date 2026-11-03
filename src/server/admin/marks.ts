import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminMarks } from "@/lib/db/schema";

export type MarkKind = "post-hidden" | "post-mute" | "mention-link-hidden" | "teachers-distinct" | "signout" | "setting" | "import";
export type SettingKey = "maintenance" | "sync-paused";

export async function setMark(kind: MarkKind, target: string, actorId: string | null, opts: { data?: Record<string, unknown>; until?: Date | null } = {}) {
  const values = { kind, target, actorId, data: opts.data ?? {}, until: opts.until ?? null, at: new Date() };
  await db()
    .insert(adminMarks)
    .values(values)
    .onConflictDoUpdate({ target: [adminMarks.kind, adminMarks.target], set: { data: values.data, until: values.until, actorId, at: values.at } });
}

export const clearMark = (kind: MarkKind, target: string) =>
  db().delete(adminMarks).where(and(eq(adminMarks.kind, kind), eq(adminMarks.target, target)));

const live = (now = new Date()) => or(isNull(adminMarks.until), gt(adminMarks.until, now));

/** Settings as a map: `maintenance` and `sync-paused` are on when present. */
export async function settings(): Promise<Record<SettingKey, boolean>> {
  const rows = await db().select({ target: adminMarks.target }).from(adminMarks).where(eq(adminMarks.kind, "setting"));
  const on = new Set(rows.map((r) => r.target));
  return { maintenance: on.has("maintenance"), "sync-paused": on.has("sync-paused") };
}

/** For the shell and the sync jobs: is the maintenance banner on / syncing paused? */
export const settingOn = async (key: SettingKey) => (await settings())[key];

/** Anonymous post ids hidden by moderators (views filter these out). */
export async function hiddenPosts(ids?: string[]) {
  const rows = await db()
    .select({ target: adminMarks.target })
    .from(adminMarks)
    .where(and(eq(adminMarks.kind, "post-hidden"), ids?.length ? inArray(adminMarks.target, ids) : undefined));
  return new Set(rows.map((r) => r.target));
}

/**
 * Whether the author of this post is muted. The posting flow resolves the
 * post's private author token itself; admins only ever name the post.
 */
export async function postMuted(postId: string, now = new Date()) {
  const [row] = await db().select({ until: adminMarks.until }).from(adminMarks).where(and(eq(adminMarks.kind, "post-mute"), eq(adminMarks.target, postId), live(now)));
  return !!row;
}

/** Sessions issued before this time are void ("Sign out everywhere"). The auth layer checks it. */
export async function sessionsRevokedAt(userId: string): Promise<Date | null> {
  const [row] = await db().select({ at: adminMarks.at }).from(adminMarks).where(and(eq(adminMarks.kind, "signout"), eq(adminMarks.target, userId)));
  return row?.at ?? null;
}

export const pairKey = (a: string, b: string) => [a, b].sort().join("|");
