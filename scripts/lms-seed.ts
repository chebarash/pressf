import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { saveAccount } from "@/lib/lms/store";

/**
 * Seed one LMS login so the harvester has a token before the public sign-in is
 * switched over. Credentials come from the environment, never the command line
 * or source, so they stay out of shell history and logs:
 *
 *   LMS_SEED_EMAIL=you@newuu.uz LMS_SEED_PASSWORD='…' npx tsx scripts/lms-seed.ts
 *
 * Requires CREDENTIAL_KEY and DATABASE_URL to be set.
 */
async function main() {
  const email = process.env.LMS_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.LMS_SEED_PASSWORD;
  if (!email || !password) throw new Error("Set LMS_SEED_EMAIL and LMS_SEED_PASSWORD");
  if (!process.env.CREDENTIAL_KEY) throw new Error("Set CREDENTIAL_KEY");

  const [user] = await db()
    .insert(users)
    .values({ email })
    .onConflictDoUpdate({ target: users.email, set: { email } })
    .returning();

  await saveAccount(user.id, email, password);
  const [check] = await db().select({ id: users.id }).from(users).where(eq(users.id, user.id));
  console.log(`Saved LMS login for ${email} (user ${check.id}).`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
