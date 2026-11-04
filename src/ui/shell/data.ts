import { eq, sql } from "drizzle-orm";
import { cache } from "react";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { lmsAccounts, lmsCache, users, userState } from "@/lib/db/schema";
import type { UserCache } from "@/lib/lms/cache";
import { termName } from "@/server/sync/types";
import { cleanHints } from "@/core/hints";

export type ShellUser = {
  name: string;
  subtitle: string;
  telegramLinked: boolean;
  /** The LMS rejected the saved password: ask to sign in again (8.3). */
  needsReauth: boolean;
  syncedAt: string | null;
  email: string;
  /** "First time here" hints already dismissed (src/core/hints.ts). */
  hints: string[];
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
    .select({
      telegramId: users.telegramId, data: lmsCache.data, syncedAt: lmsCache.syncedAt, status: lmsAccounts.status,
      // The background sync's time (snapshot.lms.at) (grades, attendance, files), every ~20 min; the profile cache refreshes only every 6 h.
      lastSync: sql<string | null>`${userState.snapshot}->'lms'->>'at'`,
      hints: userState.hints,
    })
    .from(users)
    .leftJoin(lmsCache, eq(lmsCache.userId, users.id))
    .leftJoin(userState, eq(userState.userId, users.id))
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
    syncedAt: [row?.syncedAt?.toISOString() ?? null, row?.lastSync ?? null].filter((v): v is string => !!v && !Number.isNaN(Date.parse(v))).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null,
    email: user.email,
    hints: Object.keys(cleanHints(row?.hints)),
  };
});
