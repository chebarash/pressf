import { eq } from "drizzle-orm";
import { getServerSession, type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { cache } from "react";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env, isAdminEmail, STUDENT_DOMAIN } from "@/lib/env";
import { login } from "@/lib/lms/client";
import { preloadUser } from "@/lib/lms/cache";
import { persistAccount } from "@/lib/lms/store";
import { verifyInitData } from "@/lib/telegram/webapp";

const isStudent = (email?: string | null) => !!email && email.toLowerCase().endsWith(`@${STUDENT_DOMAIN}`);

export const authOptions: NextAuthOptions = {
  providers: [
    // Press F signs in through the university LMS: the password is verified
    // against hero.study and sealed so the server can read the student's courses
    // and keep background refresh working after the 72h token expires.
    CredentialsProvider({
      id: "lms",
      name: "NewUU",
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password || !isStudent(email)) return null;
        // Any failure — wrong password or the LMS being down — just blocks
        // sign-in; the form shows one message for both.
        let session;
        try {
          session = await login(email, password);
        } catch {
          return null;
        }
        const [row] = await db()
          .insert(users)
          .values({ email })
          .onConflictDoUpdate({ target: users.email, set: { email } })
          .returning();
        await persistAccount(row.id, password, session);
        // Warm the cache now so the first page loads instantly from it.
        await preloadUser(row.id, row.email).catch(() => {});
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
        return row ? { id: row.id, email: row.email } : null;
      },
    }),
  ],
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
