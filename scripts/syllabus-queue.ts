/**
 * Saves the syllabi waiting to be parsed, with a download link for each file
 * (valid for an hour), so the operator can read them.
 *
 *   railway run npx tsx scripts/syllabus-queue.ts <outDir> [--download]
 *
 * Writes <outDir>/syllabus-queue.json. With --download, also saves each file
 * into <outDir>/files/ and records its local path as "file" in the JSON.
 * Reads SITE_URL and CRON_SECRET from the environment; the secret is never printed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Item = { id: string; courseCode: string; sourceKey: string; fileId: string | null; name: string; origin: string; createdAt: string; url: string; file?: string };

const SITE = (process.env.SITE_URL || process.env.NEXTAUTH_URL || "https://pressf.chebarash.uz").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;

async function main() {
  const [dir, ...rest] = process.argv.slice(2);
  if (!dir || dir.startsWith("--")) {
    console.error("Usage: syllabus-queue.ts <outDir> [--download]");
    process.exit(2);
  }
  if (!SECRET) throw new Error("CRON_SECRET is not set");
  const out = resolve(dir);
  const res = await fetch(`${SITE}/api/admin/syllabus/queue`, { headers: { authorization: `Bearer ${SECRET}` } });
  if (!res.ok) throw new Error(`The queue answered HTTP ${res.status}`);
  const { items } = (await res.json()) as { count: number; items: Item[] };
  mkdirSync(out, { recursive: true });

  if (rest.includes("--download") && items.length) {
    const files = join(out, "files");
    mkdirSync(files, { recursive: true });
    for (const item of items) {
      // A local name from the course and source only: the file's own name is untrusted.
      const ext = /\.(pdf|docx?|pptx?)$/i.exec(item.name)?.[1]?.toLowerCase() ?? "bin";
      const local = join(files, `${item.courseCode}-${item.sourceKey.replace(/[^\w-]+/g, "_")}.${ext}`);
      const file = await fetch(item.url);
      if (!file.ok) {
        console.error(`Could not download ${item.courseCode} ${item.sourceKey}: HTTP ${file.status}`);
        continue;
      }
      writeFileSync(local, Buffer.from(await file.arrayBuffer()));
      item.file = local;
    }
  }

  const path = join(out, "syllabus-queue.json");
  writeFileSync(path, JSON.stringify({ site: SITE, fetchedAt: new Date().toISOString(), count: items.length, items }, null, 2));
  console.log(`${items.length} syllabus file${items.length === 1 ? "" : "s"} waiting → ${path}`);
  for (const item of items) console.log(`  ${item.courseCode.padEnd(10)} ${item.sourceKey.padEnd(24)} ${item.name}`);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
