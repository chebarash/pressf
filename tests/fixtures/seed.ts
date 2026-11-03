/** Fills the test database for the browser tests. */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  process.env.DATABASE_URL ??= "postgres://pressf@127.0.0.1:5544/pressf_test";
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  const { resetDb, seedCatalog } = await import("./db");
  const { syllabus } = await import("./catalog");
  const { db } = await import("../../src/lib/db");
  const { syllabi, teacherAliases, mentions, mentionLinks } = await import("../../src/lib/db/schema");
  await resetDb();
  await seedCatalog();
  await db().insert(syllabi).values({ courseCode: "MATH111", sourceName: "calc.pdf", data: syllabus(), matched: true });
  await db().insert(teacherAliases).values({ oldId: "gonçalo-pinto", teacherId: "g-pinto" });
  await db().insert(mentions).values({ postId: 1, url: "https://t.me/x/1", text: "Is MATH111 hard?", date: new Date() });
  await db().insert(mentionLinks).values({ postId: 1, kind: "course", target: "MATH111" });
  await db().insert(mentions).values([
    { postId: 2, url: "https://t.me/x/2", text: "Is Gonçalo around today? Someone found his card.", date: null },
    { postId: 3, url: "https://t.me/x/3", text: "Pinto explains calculus really well.\nSecond line of the post stays visible.", date: null },
  ]);
  await db().insert(mentionLinks).values([{ postId: 2, kind: "teacher", target: "g-pinto" }, { postId: 3, kind: "teacher", target: "g-pinto" }]);
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
