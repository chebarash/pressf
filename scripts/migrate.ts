import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrated");
  // Old-catalog faces → LMS professors (idempotent; never blocks the start).
  try {
    const { transferOldFaces } = await import("../src/server/faces-transfer");
    await transferOldFaces((line) => console.log(line));
  } catch (error) {
    console.error("faces transfer skipped:", error instanceof Error ? error.message : error);
  }
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
