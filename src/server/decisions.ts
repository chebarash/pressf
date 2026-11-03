/**
 * Admin decisions, read by the rest of the app: settings (maintenance, sync
 * pause), "sign out everywhere", hidden or muted Anonymous posts and edits to
 * LMS files. Reads are cached (they run on every request) and expire at once
 * when an admin changes something (`decisionsChanged`).
 */
import { eq, sql, type AnyColumn } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { TYPE_LABEL, type FileType } from "@/core/files";
import { db } from "@/lib/db";
import { adminMarks, fileOverrides } from "@/lib/db/schema";
import { sessionsRevokedAt, settings, type SettingKey } from "@/server/admin/marks";
import { publicCache } from "@/server/views/cache";

export const DECISION_TAGS = { marks: "admin-marks", overrides: "file-overrides", moderation: "moderation" } as const;

/** Expire right away (not stale-while-revalidate): a revoked session or hidden file must not linger. */
export function decisionsChanged(...tags: string[]) {
  for (const tag of new Set(tags.length ? tags : Object.values(DECISION_TAGS))) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch {
      // Outside a Next request (tests, scripts) there is nothing cached.
    }
  }
}

/* ───────── settings ───────── */

const cachedSettings = publicCache("admin-settings", () => settings(), () => [DECISION_TAGS.marks], 30);

/** Maintenance banner / sync pause, cached for 30 s. */
export const settingIsOn = async (key: SettingKey) => (await cachedSettings())[key];

/* ───────── sessions ───────── */

const cachedRevoked = publicCache(
  "sessions-revoked",
  async (userId: string) => (await sessionsRevokedAt(userId))?.toISOString() ?? null,
  (userId) => [DECISION_TAGS.marks, `signout:${userId}`],
  60,
);

/** When the user's sessions were voided ("Sign out everywhere"), if ever. */
export async function revokedAt(userId: string): Promise<Date | null> {
  const iso = await cachedRevoked(userId);
  return iso ? new Date(iso) : null;
}

/** A session issued at `issuedAt` (ms) is void when an admin signed the user out after it. */
export const sessionRevoked = (issuedAt: number | null | undefined, revoked: Date | null) => !!revoked && (issuedAt ?? 0) < revoked.getTime();

/**
 * The Mini App signs in silently from Telegram. After "Sign out everywhere"
 * that would undo the sign-out, so it is refused until the student signs in
 * with the LMS password again (which sets `relinked`).
 */
export async function telegramLoginBlocked(userId: string) {
  const [row] = await db().select({ data: adminMarks.data }).from(adminMarks).where(sql`${adminMarks.kind} = 'signout' and ${adminMarks.target} = ${userId}`);
  return !!row && row.data?.relinked !== true;
}

/** The student proved the password again: Telegram may sign in silently from now on. */
export async function markRelinked(userId: string) {
  await db()
    .update(adminMarks)
    .set({ data: sql`${adminMarks.data} || '{"relinked": true}'::jsonb` })
    .where(sql`${adminMarks.kind} = 'signout' and ${adminMarks.target} = ${userId}`);
}

/* ───────── Anonymous posts ───────── */

/** SQL condition: the post is neither hidden by a moderator nor under a live mute. */
export const postVisible = (postId: AnyColumn) => sql`not exists (
  select 1 from ${adminMarks} m
  where m.target = ${postId}::text
    and (m.kind = 'post-hidden' or (m.kind = 'post-mute' and (m.until is null or m.until > now())))
)`;

/* ───────── LMS file edits ───────── */

export type FileOverride = { title: string | null; type: string | null; week: number | null; hidden: boolean };

/** Every admin edit to an LMS file, keyed by file id (a small table), cached for 5 min. */
export const fileOverridesMap = publicCache(
  "file-overrides",
  async (): Promise<Record<string, FileOverride>> => {
    const rows = await db().select().from(fileOverrides);
    return Object.fromEntries(rows.map((r) => [r.fileId, { title: r.title, type: r.type, week: r.week, hidden: r.hidden }]));
  },
  () => [DECISION_TAGS.overrides],
  300,
);

/** One file's edit (detail pages, OG cards, file routes). */
export async function fileOverride(fileId: string): Promise<FileOverride | null> {
  const [r] = await db().select().from(fileOverrides).where(eq(fileOverrides.fileId, fileId));
  return r ? { title: r.title, type: r.type, week: r.week, hidden: r.hidden } : null;
}

const isType = (t: string | null | undefined): t is FileType => !!t && t in TYPE_LABEL;

/** Applies an edit to a file's shown fields; null when the file is hidden. */
export function overlay<T extends { title: string; type: FileType; week: number | null; typeLabel?: string }>(item: T, o: FileOverride | null | undefined): T | null {
  if (!o) return item;
  if (o.hidden) return null;
  const type = isType(o.type) ? o.type : item.type;
  const out = { ...item, title: o.title?.trim() || item.title, type, week: o.week ?? item.week };
  if ("typeLabel" in item) (out as T).typeLabel = TYPE_LABEL[type];
  return out;
}

/** Applies edits to a list of LMS files (student uploads pass through), dropping hidden ones. */
export function overlayAll<T extends { id: string; source?: string; title: string; type: FileType; week: number | null; typeLabel?: string }>(items: T[], map: Record<string, FileOverride>): T[] {
  const out: T[] = [];
  for (const i of items) {
    const next = i.source === "students" ? i : overlay(i, map[i.id]);
    if (next) out.push(next);
  }
  return out;
}
