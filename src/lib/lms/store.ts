import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lmsAccounts, users } from "@/lib/db/schema";
import { login, LmsError, type LmsSession } from "@/lib/lms/client";
import { open, seal } from "@/lib/lms/crypto";

/**
 * Keeps each student's LMS session alive. A saved login holds the password
 * sealed by lms/crypto; the ~72h token is cached and re-minted from the
 * password when it expires. All logins flow through here so tokens stay fresh
 * for both request-time reads and background harvesting.
 */

/** Re-login this many ms before the token's own expiry, to avoid edge races. */
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

/** Read the `exp` claim (seconds) from a JWT without verifying it. */
function tokenExpiry(token: string): Date | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Verify an email/password against the LMS and save it for `userId`. Throws
 * LmsError if the credentials are rejected, so callers can show a sign-in error
 * instead of saving a dead login.
 */
export async function saveAccount(userId: string, email: string, password: string): Promise<LmsSession> {
  const session = await login(email, password);
  const expiresAt = tokenExpiry(session.token);
  await db()
    .insert(lmsAccounts)
    .values({
      userId,
      sealedPassword: seal(password),
      token: session.token,
      tokenExpiresAt: expiresAt,
      status: "active",
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: lmsAccounts.userId,
      set: {
        sealedPassword: seal(password),
        token: session.token,
        tokenExpiresAt: expiresAt,
        status: "active",
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  return session;
}

/** Mark a saved login dead (wrong password now) so refresh skips it and the UI can re-ask. */
export async function markInvalid(userId: string) {
  await db()
    .update(lmsAccounts)
    .set({ status: "invalid", token: null, updatedAt: new Date() })
    .where(eq(lmsAccounts.userId, userId));
}

/**
 * Return a usable LMS session for `userId`, re-logging in from the sealed
 * password when the cached token is missing or near expiry. Returns null when
 * there is no saved login or the password no longer works (then marked invalid).
 */
export async function sessionFor(userId: string): Promise<LmsSession | null> {
  const [row] = await db()
    .select({
      email: users.email,
      sealedPassword: lmsAccounts.sealedPassword,
      token: lmsAccounts.token,
      tokenExpiresAt: lmsAccounts.tokenExpiresAt,
      status: lmsAccounts.status,
    })
    .from(lmsAccounts)
    .innerJoin(users, eq(users.id, lmsAccounts.userId))
    .where(eq(lmsAccounts.userId, userId));
  if (!row || row.status !== "active") return null;

  const fresh =
    row.token && row.tokenExpiresAt && row.tokenExpiresAt.getTime() - REFRESH_MARGIN_MS > Date.now();
  if (fresh) {
    await db().update(lmsAccounts).set({ lastUsedAt: new Date() }).where(eq(lmsAccounts.userId, userId));
    return { token: row.token! };
  }

  let password: string;
  try {
    password = open(row.sealedPassword);
  } catch {
    await markInvalid(userId);
    return null;
  }
  try {
    const session = await login(row.email, password);
    await db()
      .update(lmsAccounts)
      .set({
        token: session.token,
        tokenExpiresAt: tokenExpiry(session.token),
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(lmsAccounts.userId, userId));
    return session;
  } catch (err) {
    // A rejected password is permanent until the student re-enters it; a network
    // or server blip is not, so only the former invalidates the saved login.
    if (err instanceof LmsError && err.status === 401) await markInvalid(userId);
    return null;
  }
}
