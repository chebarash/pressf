import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Role } from "@/core/roles";
import { db } from "@/lib/db";
import { userRoles, users } from "@/lib/db/schema";
import { env, isAdminEmail } from "@/lib/env";

/**
 * Pseudonymous ids for ratings and reports: an HMAC of the user id under a
 * server secret. Same student → same id (so they can edit), but the tables
 * never hold a user id, so nobody reading them can tell who rated what.
 */
export function pseudonym(userId: string, purpose: "rater" | "reporter") {
  const secret = env().CREDENTIAL_KEY;
  if (!secret) throw new Error("CREDENTIAL_KEY is not set");
  return createHmac("sha256", secret).update(`${purpose}:${userId}`).digest("base64url");
}

/** The secret for one-time link tokens, derived so it differs from the rater secret. */
export function linkSecret() {
  const secret = env().CREDENTIAL_KEY;
  if (!secret) throw new Error("CREDENTIAL_KEY is not set");
  return createHmac("sha256", secret).update("link-tokens").digest("hex");
}

/** The role of a user: ADMIN_EMAILS always win, then the stored role, else student. */
export async function roleOf(userId: string): Promise<Role> {
  const [row] = await db()
    .select({ email: users.email, role: userRoles.role })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) return "guest";
  if (isAdminEmail(row.email)) return "admin";
  return row.role ?? "student";
}

export async function setRole(userId: string, role: Exclude<Role, "guest">) {
  await db().insert(userRoles).values({ userId, role }).onConflictDoUpdate({ target: userRoles.userId, set: { role, updatedAt: new Date() } });
}
