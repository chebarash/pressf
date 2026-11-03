/**
 * Submits parsed syllabi to the course pages.
 *
 *   railway run npx tsx scripts/syllabus-submit.ts <json-file>
 *
 * The file holds one submission or a list of them:
 *   { "courseCode": "MATH111", "sourceKey": "lms:4400", "data": { …SyllabusSchema… } }
 * (sourceKey or fileId from syllabus-queue.json; either may be left out when
 * the course has only one file waiting). Each is checked locally against the
 * same schema first, then sent to POST /api/admin/syllabus.
 * Reads SITE_URL and CRON_SECRET from the environment; the secret is never printed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SyllabusSubmitSchema } from "../src/lib/syllabus";

const SITE = (process.env.SITE_URL || process.env.NEXTAUTH_URL || "https://pressf.chebarash.uz").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;

async function main() {
  const [file] = process.argv.slice(2);
  if (!file) {
    console.error("Usage: syllabus-submit.ts <json-file>");
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(resolve(file), "utf8")) as unknown;
  const list = Array.isArray(raw) ? raw : [raw];

  // Nothing is sent when any entry is malformed.
  const problems = list.flatMap((entry, i) => {
    const r = SyllabusSubmitSchema.safeParse(entry);
    return r.success ? [] : [`#${i + 1}: ${r.error.issues.slice(0, 5).map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`];
  });
  if (problems.length) {
    console.error(`Not sent, fix these first:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  if (!SECRET) throw new Error("CRON_SECRET is not set");

  let failed = 0;
  for (const [i, entry] of list.entries()) {
    const res = await fetch(`${SITE}/api/admin/syllabus`, {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
      body: JSON.stringify(entry),
    });
    const body = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as Record<string, unknown>;
    const label = `#${i + 1} ${(entry as { courseCode: string }).courseCode}`;
    if (!res.ok) {
      failed++;
      console.error(`${label}: ${res.status} ${body.error ?? ""}`);
      continue;
    }
    const flags = Array.isArray(body.flags) && body.flags.length ? ` · flags: ${(body.flags as string[]).join(" | ")}` : "";
    console.log(`${label}: ${body.result} (${body.sourceKey})${body.cleared ? " · cleared from the queue" : ""}${flags}`);
  }
  if (failed) process.exit(1);
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
