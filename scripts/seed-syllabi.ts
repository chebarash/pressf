/** Loads the syllabi already read from the channel export. Safe to rerun. */
import "dotenv/config";
import { readFileSync } from "node:fs";

async function main() {
  const { db } = await import("../src/lib/db");
  const { syllabi } = await import("../src/lib/db/schema");
  const { getCatalog, normalizeCode } = await import("../src/lib/catalog");
  const { findSyllabusCourse, syllabusFlags } = await import("../src/lib/syllabus");
  const { courses } = await getCatalog();
  const rows = JSON.parse(readFileSync("data/syllabi-seed.json", "utf8"));
  let matched = 0;
  const review: string[] = [];
  for (const { file, result } of rows) {
    const { is_syllabus: _ignored, ...data } = result;
    const code = findSyllabusCourse(data, courses);
    const ok = code !== null;
    const courseCode = code ?? normalizeCode(data.course_code);
    const flags = syllabusFlags(data, courses);
    await db().insert(syllabi).values({ courseCode, sourceName: file, data, flags, matched: ok })
      .onConflictDoUpdate({ target: syllabi.sourceName, set: { courseCode, data, flags, matched: ok } });
    if (ok) matched++; else review.push(`${data.course_code} ${data.course_title}`);
  }
  console.log({ total: rows.length, matched, review });
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
