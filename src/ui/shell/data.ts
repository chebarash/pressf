import { eq } from "drizzle-orm";
import { cache } from "react";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { lmsAccounts, lmsCache, users } from "@/lib/db/schema";
import type { UserCache } from "@/lib/lms/cache";
import { termName } from "@/server/sync/types";

export type ShellUser = {
  name: string;
  subtitle: string;
  telegramLinked: boolean;
  /** The LMS rejected the saved password: ask to sign in again (8.3). */
  needsReauth: boolean;
  syncedAt: string | null;
  email: string;
};

/** Given name + surname initial: "Shamsiddin A." */
const short = (full: string) => {
  const [first, ...rest] = full.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
};

/**
 * What the frame needs about the signed-in student, from Postgres only (one
 * round trip, no LMS call): name, program line, Telegram link, sync state.
 */
export const shellUser = cache(async (): Promise<ShellUser | null> => {
  const user = await getUser();
  if (!user) return null;
  const [row] = await db()
    .select({ telegramId: users.telegramId, data: lmsCache.data, syncedAt: lmsCache.syncedAt, status: lmsAccounts.status })
    .from(users)
    .leftJoin(lmsCache, eq(lmsCache.userId, users.id))
    .leftJoin(lmsAccounts, eq(lmsAccounts.userId, users.id))
    .where(eq(users.id, user.id));
  const data = row?.data as UserCache | null | undefined;
  const profile = data?.profile ?? null;
  return {
    name: profile?.name ? short(profile.name) : user.email.split("@")[0],
    // Caches written before `lang=en` hold the Russian name ("Осенний (2026-2027)").
    subtitle: (data?.enrollment?.semesterName ? termName(data.enrollment.semesterName) : null) ?? user.email,
    telegramLinked: !!row?.telegramId,
    needsReauth: row?.status === "invalid",
    syncedAt: row?.syncedAt ? row.syncedAt.toISOString() : null,
    email: user.email,
  };
});
