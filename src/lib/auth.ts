import { eq } from "drizzle-orm";
import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { cache } from "react";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env, isAdminEmail, STUDENT_DOMAIN } from "@/lib/env";

const isStudent = (email?: string | null) => !!email && email.toLowerCase().endsWith(`@${STUDENT_DOMAIN}`);

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: env().GOOGLE_CLIENT_ID,
      clientSecret: env().GOOGLE_CLIENT_SECRET,
      authorization: { params: { hd: STUDENT_DOMAIN, prompt: "select_account" } },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/sign-in", error: "/sign-in" },
  callbacks: {
    /** The hd parameter is only a hint, so the domain is checked here on the server. */
    async signIn({ profile, user }) {
      const google = profile as { hd?: string; email_verified?: boolean } | undefined;
      const allowed = isStudent(user.email) && google?.hd === STUDENT_DOMAIN && google?.email_verified === true;
      return allowed ? true : "/sign-in?error=domain";
    },
  },
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
