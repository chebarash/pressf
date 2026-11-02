import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { catalogCache, faces } from "@/lib/db/schema";
import { signedUrl } from "@/lib/storage";

/**
 * Export every uploaded professor face image so they can be re-assigned after
 * the upcoming teacher-id change. For each row in the `faces` table, the image
 * is downloaded from S3 and written to the output dir as `<teacherId>.png`, and
 * a `manifest.json` records each teacher's old display name for re-matching to
 * the new LMS teachers later.
 *
 * Needs DATABASE_URL and the S3_* vars to run; the owner runs it with the prod
 * credentials. Output dir defaults to ./faces-export (override with FACES_OUT):
 *
 *   DATABASE_URL=... <s3 vars> npx tsx scripts/faces-export.ts
 */

type Teacher = { id: string; display_name?: string; name?: string };

async function main() {
  const outDir = process.env.FACES_OUT?.trim() || "./faces-export";
  await mkdir(outDir, { recursive: true });

  const [teachersRow] = await db()
    .select({ data: catalogCache.data })
    .from(catalogCache)
    .where(eq(catalogCache.key, "teachers"));
  const teachers = (teachersRow?.data as Teacher[] | undefined) ?? [];
  const nameById = new Map(teachers.map((t) => [t.id, t.display_name ?? t.name ?? null]));

  const rows = await db().select().from(faces);
  const manifest: { teacherId: string; oldName: string | null }[] = [];

  for (const row of rows) {
    const url = await signedUrl(row.storageKey);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download ${row.storageKey} (HTTP ${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(join(outDir, `${row.teacherId}.png`), bytes);
    manifest.push({ teacherId: row.teacherId, oldName: nameById.get(row.teacherId) ?? null });
  }

  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`Exported ${manifest.length} face${manifest.length === 1 ? "" : "s"} to ${outDir}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
