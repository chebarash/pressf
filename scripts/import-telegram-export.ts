/**
 * Publishes a Telegram channel export. Stores files, then writes the rows to load:
 *   railway run --service web npx tsx scripts/import-telegram-export.ts <export dir> rows.json overrides.json [--dry]
 *   railway ssh --service web -- npx tsx scripts/load-materials.ts < rows.json
 * The database has no public address, so loading happens inside the service.
 */
import "dotenv/config";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KINDS = /\.(pdf|docx|pptx)$/i;
type Message = { id: number; date: string; file?: string; file_name?: string; mime_type?: string; text: string | Array<string | { text: string }> };

const caption = (text: Message["text"]) =>
  typeof text === "string" ? text : text.map((part) => (typeof part === "string" ? part : part.text)).join("");

async function main() {
  const [, , dir, out, overridesPath, dry] = process.argv;
  const overrides = JSON.parse(readFileSync(overridesPath, "utf8")) as Record<string, object | null>;
  const { classify } = await import("../src/lib/telegram/classify");
  const { storeMaterial } = await import("../src/lib/telegram/store");
  const response = await fetch(`${process.env.BOT_API_URL}/api/courses`, { headers: { Authorization: `Bearer ${process.env.BOT_API_TOKEN}` } });
  const known = ((await response.json()).items as Array<{ code: string; subject: string }>).map((c) => ({ code: c.code, name: c.subject }));
  const { messages } = JSON.parse(readFileSync(join(dir, "result.json"), "utf8")) as { messages: Message[] };

  const rows = [];
  const skipped: string[] = [];
  for (const message of messages) {
    if (!message.file || !message.file_name || !KINDS.test(message.file_name)) continue;
    const text = caption(message.text);
    if (overrides[message.file_name] === null) continue;
    const guess = { ...classify(message.file_name, text, known), ...overrides[message.file_name] };
    guess.courseName = known.find((course) => course.code === guess.courseCode)?.name ?? guess.courseName;
    if (!guess.courseCode || !guess.type) {
      skipped.push(`${message.file_name} | ${text.slice(0, 70)} | ${guess.courseCode} ${guess.type}`);
      continue;
    }
    const path = join(dir, message.file);
    const source = { ...guess, fileName: message.file_name, mimeType: message.mime_type ?? "application/pdf" };
    const row = { ...source, size: statSync(path).size, caption: text, publishedAt: message.date };
    if (dry) { rows.push(row); continue; }
    rows.push({ ...row, ...(await storeMaterial(readFileSync(path), source)) });
    console.log("stored", message.file_name);
  }
  writeFileSync(out, JSON.stringify(rows));
  console.log(`${rows.length} ready, ${skipped.length} need a look`);
  for (const line of skipped) console.log("  ", line);
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
