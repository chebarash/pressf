import { desc, eq, ilike, inArray, lt, or } from "drizzle-orm";
import { shortName } from "@/core/people";
import { db } from "@/lib/db";
import { botChats, lmsCache, lmsCourses, users } from "@/lib/db/schema";
import type { UserCache } from "@/lib/lms/cache";
import { DRAFT_TTL_MS, type CourseOption, type Draft } from "./conversation";

/** Postgres-backed conversation state: one open draft per private chat. */

export type Linked = { id: string; email: string };

/** The Press F account linked to this Telegram user, if any. */
export async function linkedUser(telegramId: number | string): Promise<Linked | null> {
  const [row] = await db().select({ id: users.id, email: users.email }).from(users).where(eq(users.telegramId, String(telegramId)));
  return row ?? null;
}

/** The open draft, or null when there is none or it went stale. */
export async function loadDraft(chatId: number | string, now = new Date()): Promise<Draft | null> {
  const [row] = await db().select().from(botChats).where(eq(botChats.chatId, String(chatId)));
  if (!row) return null;
  if (now.getTime() - row.updatedAt.getTime() > DRAFT_TTL_MS) {
    await dropDraft(chatId);
    return null;
  }
  return row.draft as unknown as Draft;
}

export async function saveDraft(chatId: number | string, userId: string | null, draft: Draft) {
  const values = { chatId: String(chatId), userId, draft: draft as unknown as Record<string, unknown>, updatedAt: new Date() };
  await db().insert(botChats).values(values).onConflictDoUpdate({ target: botChats.chatId, set: { userId, draft: values.draft, updatedAt: values.updatedAt } });
}

export const dropDraft = (chatId: number | string) => db().delete(botChats).where(eq(botChats.chatId, String(chatId)));

/** Removes drafts nobody finished. Safe to call from any cron. */
export const purgeDrafts = (now = new Date()) => db().delete(botChats).where(lt(botChats.updatedAt, new Date(now.getTime() - DRAFT_TTL_MS)));

/** The LMS subject row for a course code; the newest semester's when a code repeats. */
async function coursesByCode(codes: string[]): Promise<CourseOption[]> {
  if (!codes.length) return [];
  const rows = await db().select({ id: lmsCourses.id, code: lmsCourses.code, name: lmsCourses.name, semesterId: lmsCourses.semesterId })
    .from(lmsCourses).where(inArray(lmsCourses.code, codes)).orderBy(desc(lmsCourses.semesterId), desc(lmsCourses.fetchedAt));
  const byCode = new Map<string, CourseOption>();
  for (const r of rows) if (!byCode.has(r.code)) byCode.set(r.code, { id: r.id, code: r.code, name: r.name });
  return codes.flatMap((c) => byCode.get(c) ?? []);
}

/** What the course question offers: the linked course first, then this semester's courses. */
export async function studentContext(userId: string | null, linkedCode?: string): Promise<{ courses: CourseOption[]; name: string | null }> {
  const cache = userId ? ((await db().select({ data: lmsCache.data }).from(lmsCache).where(eq(lmsCache.userId, userId)))[0]?.data as UserCache | undefined) : undefined;
  const codes = (cache?.enrollment?.courses ?? []).map((c) => c.code);
  const wanted = linkedCode ? [linkedCode.toUpperCase(), ...codes.filter((c) => c.toUpperCase() !== linkedCode.toUpperCase())] : codes;
  const full = cache?.profile?.name?.trim();
  // The profile falls back to the email when the LMS has no name; never show that.
  const name = full && !full.includes("@") ? shortName(full) : null;
  return { courses: await coursesByCode(wanted), name };
}

/** "Another course…": by name or code over the harvested LMS catalog. */
export async function searchCourses(query: string, limit = 6): Promise<CourseOption[]> {
  const q = query.trim().replace(/[%_\\]/g, "");
  if (q.length < 2) return [];
  const compact = q.replace(/\s+/g, "");
  const rows = await db().select({ code: lmsCourses.code }).from(lmsCourses)
    .where(or(ilike(lmsCourses.name, `%${q}%`), ilike(lmsCourses.code, `%${compact}%`)))
    .orderBy(lmsCourses.name).limit(50);
  const codes = [...new Set(rows.map((r) => r.code))].slice(0, limit);
  return coursesByCode(codes);
}
