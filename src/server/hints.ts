import { eq, sql } from "drizzle-orm";
import { cleanHints, HINT_IDS } from "@/core/hints";
import { db } from "@/lib/db";
import { userState } from "@/lib/db/schema";

/** The hints a student dismissed (ids), src/core/hints.ts. */
export async function dismissedHints(userId: string): Promise<string[]> {
  const [row] = await db().select({ hints: userState.hints }).from(userState).where(eq(userState.userId, userId));
  return Object.keys(cleanHints(row?.hints));
}

/** Dismisses one hint for good (every device). Unknown ids are ignored. */
export async function dismissHint(userId: string, id: string, now = new Date()): Promise<boolean> {
  if (!HINT_IDS.has(id)) return false;
  const one = { [id]: now.toISOString() };
  await db()
    .insert(userState)
    .values({ userId, hints: one })
    .onConflictDoUpdate({ target: userState.userId, set: { hints: sql`${userState.hints} || ${JSON.stringify(one)}::jsonb`, updatedAt: now } });
  return true;
}
