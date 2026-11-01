/** Loads the syllabi already read from the channel export. Safe to rerun. */
import "dotenv/config";
import { readFileSync } from "node:fs";

async function main() {
  const { db } = await import("../src/lib/db");
  const { syllabi } = await import("../src/lib/db/schema");
  const { getCatalog, normalizeCode } = await import("../src/lib/catalog");
  const { matchesCourse, syllabusFlags } = await import("../src/lib/syllabus");
  const { courses } = await getCatalog();
  const rows = JSON.parse(readFileSync("data/syllabi-seed.json", "utf8"));
  let matched = 0;
  const review: string[] = [];
  for (const { file, result } of rows) {
    const { is_syllabus: _ignored, ...data } = result;
    const ok = matchesCourse(data, courses);
    const flags = syllabusFlags(data, courses);
    await db().insert(syllabi).values({ courseCode: normalizeCode(data.course_code), sourceName: file, data, flags, matched: ok })
      .onConflictDoUpdate({ target: syllabi.sourceName, set: { data, flags, matched: ok } });
    if (ok) matched++; else review.push(`${data.course_code} ${data.course_title}`);
  }
  console.log({ total: rows.length, matched, review });
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
