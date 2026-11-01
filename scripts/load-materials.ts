/** Loads rows from import-telegram-export.ts, read from stdin. Safe to rerun. */
import "dotenv/config";
import { readFileSync } from "node:fs";

async function main() {
  const { db } = await import("../src/lib/db");
  const { materials } = await import("../src/lib/db/schema");
  const rows = JSON.parse(readFileSync(0, "utf8")) as Array<Omit<typeof materials.$inferInsert, "publishedAt"> & { publishedAt: string }>;
  let added = 0;
  for (const row of rows) {
    const inserted = await db().insert(materials).values({ ...row, status: "approved", publishedAt: new Date(row.publishedAt) }).onConflictDoNothing().returning({ id: materials.id });
    added += inserted.length;
  }
  console.log(`${added} added, ${rows.length - added} already there`);
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
