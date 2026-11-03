import { eq } from "drizzle-orm";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { cache } from "react";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env, isAdminEmail, STUDENT_DOMAIN } from "@/lib/env";
import { login, LmsError } from "@/lib/lms/client";
import { persistAccount } from "@/lib/lms/store";
import { verifyInitData } from "@/lib/telegram/webapp";
import { markRelinked, revokedAt, sessionRevoked, telegramLoginBlocked } from "@/server/decisions";
import { redeemLink } from "@/server/link";

const isStudent = (email?: string | null) => !!email && email.toLowerCase().endsWith(`@${STUDENT_DOMAIN}`);

/** Why an LMS sign-in failed; the sign-in sheet shows a message for each. */
export type SignInError = "wrong-password" | "lms-down" | "not-student";

/** No answer, or a server error: the LMS is down, not the password wrong. */
const lmsDown = (error: unknown) => !(error instanceof LmsError) || error.status === 0 || error.status >= 500;

/** One Telegram account belongs to one Press F account. */
async function linkTelegram(userId: string, telegramId: string) {
  await db().update(users).set({ telegramId: null }).where(eq(users.telegramId, telegramId));
  await db().update(users).set({ telegramId }).where(eq(users.id, userId));
}

const fail = (code: SignInError) => new Error(code);

export const authOptions: NextAuthOptions = {
  providers: [
    // Press F signs in through the university LMS: the password is verified
    // against hero.study and sealed so the server can read the student's courses
    // and keep background refresh working after the 72h token expires. Failures
    // throw a SignInError code; the password is never logged or returned.
    CredentialsProvider({
      id: "lms",
      name: "NewUU",
      credentials: { email: {}, password: {}, initData: {} },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;
        if (!isStudent(email)) throw fail("not-student");
        let session;
        try {
          session = await login(email, password);
        } catch (error) {
          throw fail(lmsDown(error) ? "lms-down" : "wrong-password");
        }
        const [row] = await db()
          .insert(users)
          .values({ email })
          .onConflictDoUpdate({ target: users.email, set: { email } })
          .returning();
        await persistAccount(row.id, password, session);
        // The password was proven again: the Mini App may sign in silently after a "Sign out everywhere".
        await markRelinked(row.id);
        // Signing in inside the Mini App links this Telegram to the account.
        const telegramId = verifyInitData(credentials?.initData ?? "", 3600);
        if (telegramId) await linkTelegram(row.id, telegramId);
        return { id: row.id, email: row.email };
      },
    }),
    // The mini app reuses the account once its Telegram is linked, so it signs
    // in silently from the Telegram initData instead of asking again.
    CredentialsProvider({
      id: "telegram",
      name: "Telegram",
      credentials: { initData: {} },
      async authorize(credentials) {
        const telegramId = verifyInitData(credentials?.initData ?? "");
        if (!telegramId) return null;
        const [row] = await db().select().from(users).where(eq(users.telegramId, telegramId));
        if (!row) return null;
        // After "Sign out everywhere" the Mini App asks for the LMS password once more.
        if (await telegramLoginBlocked(row.id)) return null;
        return { id: row.id, email: row.email };
      },
    }),
    // Desktop → Telegram hand-off: the Mini App redeems a one-time code issued on
    // the signed-in desktop, becomes the same person and links its Telegram.
    CredentialsProvider({
      id: "link",
      name: "Link",
      credentials: { token: {}, initData: {} },
      async authorize(credentials) {
        // Distinct codes so the Mini App can say what went wrong (shown as result.error).
        const telegramId = verifyInitData(credentials?.initData ?? "");
        if (!telegramId) throw new Error("telegram-unverified");
        if (!credentials?.token) throw new Error("link-expired");
        const userId = await redeemLink(credentials.token);
        if (!userId) throw new Error("link-expired");
        const [row] = await db().select().from(users).where(eq(users.id, userId));
        if (!row) return null;
        await linkTelegram(row.id, telegramId);
        await markRelinked(row.id);
        return { id: row.id, email: row.email };
      },
    }),
  ],
  callbacks: {
    // `issued` is set once at sign-in (`iat` moves on every refresh). A session
    // issued before an admin's "Sign out everywhere" is void: throwing here
    // makes next-auth clear the cookie and getServerSession return null.
    async jwt({ token, user }) {
      if (user) {
        token.issued = Date.now();
        return token;
      }
      if (token.sub && sessionRevoked(token.issued as number | undefined, await revokedAt(token.sub))) throw new Error("Session revoked");
      return token;
    },
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/sign-in", error: "/sign-in" },
};

export type CurrentUser = { id: string; email: string; group: string | null; isAdmin: boolean };

export const getUser = cache(async (): Promise<CurrentUser | null> => {
  const dev = process.env.NODE_ENV !== "production" ? env().DEV_LOGIN_EMAIL : undefined;
  const email = dev ?? (await getServerSession(authOptions))?.user?.email;
  if (!email || (!dev && !isStudent(email))) return null;
  const [row] = await db().insert(users).values({ email: email.toLowerCase() })
    .onConflictDoUpdate({ target: users.email, set: { email: email.toLowerCase() } }).returning();
  return { id: row.id, email: row.email, group: row.group, isAdmin: isAdminEmail(row.email) };
});

export async function requireAdmin() {
  const user = await getUser();
  if (!user?.isAdmin) throw new Error("Not allowed");
  return user;
}
