/**
 * Posts an exam schedule (JSON, the shape in src/server/exam-import.ts) to the site.
 *
 *   railway run npx tsx scripts/exams-import.ts <schedule.json>
 *
 * Re-running with the same source (same url, or same label without a url)
 * replaces that source's exams; students whose exam moved get one notice.
 * Reads SITE_URL and CRON_SECRET from the environment; the secret is never printed.
 * The file may hold student IDs: keep it outside the repository and delete it after.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SITE = (process.env.SITE_URL || process.env.NEXTAUTH_URL || "https://pressf.chebarash.uz").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: exams-import.ts <schedule.json>");
    process.exit(2);
  }
  if (!SECRET) throw new Error("CRON_SECRET is not set");
  const body = readFileSync(resolve(file), "utf8");
  JSON.parse(body); // fail early on a broken file
  const res = await fetch(`${SITE}/api/admin/exams/import`, {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
    body,
  });
  const out = (await res.json().catch(() => ({}))) as { error?: string; sourceId?: string; stats?: Record<string, unknown> };
  if (!res.ok) {
    console.error(`Import failed (${res.status}): ${out.error ?? "no details"}`);
    process.exit(1);
  }
  console.log(`Source ${out.sourceId}`);
  console.log(JSON.stringify(out.stats, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
