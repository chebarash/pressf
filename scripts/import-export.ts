/**
 * Imports course files from a Telegram Desktop channel export (result.json + files/).
 *
 *   railway run npx tsx scripts/import-export.ts <exportDir> plan [--out <dir>]
 *   railway run npx tsx scripts/import-export.ts <exportDir> commit <decisions.json> [--out <dir>]
 *
 * plan: sends each document to /api/admin/import/plan (writes nothing) and
 * saves plan.json, plan.csv and decisions.draft.json (the plan's guesses, with
 * anything unsure marked skip) for a lead to review.
 * commit: sends each approved decision with its file to /api/admin/import/commit.
 *
 * The export is untrusted data: it is only read (JSON and file bytes), and file
 * paths must stay inside the export folder. Reads SITE_URL and CRON_SECRET from
 * the environment; the secret is never printed.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { LARGE_BYTES, plainText } from "../src/core/import";

type Message = { id: number; type?: string; date?: string; file?: string; file_name?: string; mime_type?: string; media_type?: string; text?: unknown };
type Doc = { postId: number; path: string | null; fileName: string; mime: string; date: string | null; text: string; size: number };

const SITE = (process.env.SITE_URL || process.env.NEXTAUTH_URL || "https://pressf.chebarash.uz").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;

function args() {
  const [dir, mode, ...rest] = process.argv.slice(2);
  const outAt = rest.indexOf("--out");
  const out = outAt >= 0 ? rest[outAt + 1] : join(tmpdir(), "pressf-import");
  const decisions = rest.find((a, i) => !a.startsWith("--") && rest[i - 1] !== "--out");
  if (!dir || (mode !== "plan" && mode !== "commit") || (mode === "commit" && !decisions)) {
    console.error("Usage: import-export.ts <exportDir> plan [--out <dir>] | <exportDir> commit <decisions.json> [--out <dir>]");
    process.exit(2);
  }
  return { dir: resolve(dir), mode, out: resolve(out), decisions };
}

/** The channel and its documents (photos and videos are left out). */
function readExport(dir: string) {
  const raw = JSON.parse(readFileSync(join(dir, "result.json"), "utf8")) as { name?: string; id?: number | string; type?: string; messages?: Message[] };
  if (!raw.name || raw.id == null || !Array.isArray(raw.messages)) throw new Error("result.json is not a channel export");
  const docs: Doc[] = [];
  for (const m of raw.messages) {
    if (m.type !== "message" || typeof m.file !== "string" || !m.mime_type || m.media_type) continue;
    const full = resolve(dir, m.file);
    // Stay inside the export; "(File not included…)" and missing files have no path.
    const inside = full.startsWith(dir + sep) && existsSync(full) && statSync(full).isFile();
    docs.push({
      postId: m.id, path: inside ? full : null, fileName: String(m.file_name ?? m.file.split("/").pop() ?? "file"), mime: m.mime_type,
      date: m.date ?? null, text: plainText(m.text), size: inside ? statSync(full).size : 0,
    });
  }
  return { channel: { id: String(raw.id), name: raw.name }, docs };
}

async function post(path: string, form: FormData) {
  if (!SECRET) throw new Error("CRON_SECRET is not set");
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${SITE}${path}`, { method: "POST", headers: { authorization: `Bearer ${SECRET}` }, body: form }).catch((error: Error) => error);
    if (res instanceof Response && res.status < 500) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) throw new Error(`${path} answered ${res.status}: ${(body as { error?: string }).error ?? ""}`);
      return body as Record<string, unknown>;
    }
    if (attempt >= 3) throw new Error(`${path} failed: ${res instanceof Response ? `HTTP ${res.status}` : res.message}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

function formFor(channel: { id: string; name: string }, d: Doc, bytes: Buffer | null, extra: Record<string, unknown> = {}) {
  const form = new FormData();
  form.set("meta", JSON.stringify({ channel, postId: d.postId, date: d.date, text: d.text, fileName: d.fileName, mime: d.mime, ...extra }));
  if (bytes) form.set("file", new Blob([new Uint8Array(bytes)], { type: d.mime }), d.fileName);
  return form;
}

async function pool<T>(items: T[], size: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  }));
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

type Candidate = { code: string; name: string; score: number; reason: string };
type Row = {
  postId: number; file: string; size: number; sha256: string; error?: string; sameAsPost?: number;
  plan?: { imported: string | null; duplicateOf: { kind: string; id: string; title: string; score: number; reason: string } | null; candidates: Candidate[]; confidence: string; type: string; exam: string | null; title: string; term: string | null; termFrom: string | null; week: number | null; flags: string[] };
};

async function plan(dir: string, out: string) {
  const { channel, docs } = readExport(dir);
  console.log(`${channel.name}: ${docs.length} documents → ${SITE}`);
  const rows: Row[] = new Array(docs.length);
  const seen = new Map<string, number>();
  // Hash locally first so copies inside the export are caught in post order.
  const hashes = docs.map((d) => (d.path ? createHash("sha256").update(readFileSync(d.path)).digest("hex") : ""));
  docs.forEach((d, i) => {
    if (hashes[i] && !seen.has(hashes[i])) seen.set(hashes[i], d.postId);
  });
  await pool(docs, 3, async (d, i) => {
    const row: Row = { postId: d.postId, file: d.fileName, size: d.size, sha256: hashes[i] };
    const first = seen.get(hashes[i]);
    if (first !== undefined && first !== d.postId) row.sameAsPost = first;
    try {
      if (!d.path) throw new Error("file missing from the export");
      const large = d.size > LARGE_BYTES;
      const form = formFor(channel, d, large ? null : readFileSync(d.path), large ? { sha256: hashes[i], size: d.size } : {});
      row.plan = (await post("/api/admin/import/plan", form)) as Row["plan"];
    } catch (error) {
      row.error = error instanceof Error ? error.message : String(error);
    }
    rows[i] = row;
    process.stdout.write(".");
  });
  process.stdout.write("\n");

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "plan.json"), JSON.stringify({ channel, site: SITE, at: new Date().toISOString(), rows }, null, 2));
  const head = ["postId", "file", "sizeMB", "sha256", "duplicateOf", "confidence", "course1", "score1", "reason1", "course2", "score2", "course3", "score3", "type", "exam", "title", "term", "termFrom", "week", "flags"];
  const lines = rows.map((r) => {
    const p = r.plan;
    const c = p?.candidates ?? [];
    const dup = r.sameAsPost ? `post ${r.sameAsPost} (same file)` : p?.duplicateOf ? `${p.duplicateOf.kind} ${p.duplicateOf.id} (${p.duplicateOf.reason}, ${p.duplicateOf.score}) ${p.duplicateOf.title}` : p?.imported ? `imported as ${p.imported}` : "";
    return [
      r.postId, r.file, (r.size / 1048576).toFixed(2), r.sha256, dup, p?.confidence ?? "error",
      c[0] ? `${c[0].code} ${c[0].name}` : "", c[0]?.score ?? "", c[0]?.reason ?? "",
      c[1] ? `${c[1].code} ${c[1].name}` : "", c[1]?.score ?? "", c[2] ? `${c[2].code} ${c[2].name}` : "", c[2]?.score ?? "",
      p?.type ?? "", p?.exam ?? "", p?.title ?? "", p?.term ?? "", p?.termFrom ?? "", p?.week ?? "", [...(p?.flags ?? []), ...(r.error ? [`error: ${r.error}`] : [])].join("; "),
    ].map(csvCell).join(",");
  });
  writeFileSync(join(out, "plan.csv"), [head.join(","), ...lines].join("\n") + "\n");

  // A starting point for the lead: the plan's guess, skipped when anything is unsure.
  const draft = rows.map((r) => {
    const p = r.plan;
    const top = p?.candidates[0];
    const unsure = !p || !top || p.confidence !== "high" || !!p.duplicateOf || !!r.sameAsPost || p.flags.length > 0;
    return { postId: r.postId, file: r.file, course: top?.code ?? "", type: p?.type ?? "other", title: p?.title ?? "", term: p?.term ?? null, week: p?.week ?? null, exam: p?.exam ?? null, skip: unsure };
  });
  writeFileSync(join(out, "decisions.draft.json"), JSON.stringify(draft, null, 2));

  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const notCourse = (r: Row) => !!r.plan?.flags.some((f) => f.startsWith("not a course file"));
  const dupe = (r: Row) => !!r.sameAsPost || (!!r.plan?.duplicateOf && r.plan.duplicateOf.reason !== "similar name");
  const summary = {
    documents: rows.length,
    high: count((r) => r.plan?.confidence === "high" && !notCourse(r)),
    ambiguous: count((r) => r.plan?.confidence === "ambiguous" && !notCourse(r)),
    noCourse: count((r) => r.plan?.confidence === "none" && !notCourse(r)),
    notCourseFiles: count(notCourse),
    duplicates: count(dupe),
    similarName: count((r) => r.plan?.duplicateOf?.reason === "similar name"),
    alreadyImported: count((r) => !!r.plan?.imported),
    flagged: count((r) => !!r.plan?.flags.length),
    errors: count((r) => !!r.error),
    draftApproved: draft.filter((d) => !d.skip).length,
  };
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(summary);
  console.log(`Plan written to ${out}`);
}

type Decision = { postId: number; course: string; type: string; title: string; term?: string | null; week?: number | null; exam?: string | null; skip?: boolean };

async function commit(dir: string, file: string, out: string) {
  const { channel, docs } = readExport(dir);
  const parsed = JSON.parse(readFileSync(resolve(file), "utf8")) as Decision[] | { rows: Array<{ postId: number; decision?: Omit<Decision, "postId"> }> };
  const decisions: Decision[] = Array.isArray(parsed) ? parsed : parsed.rows.filter((r) => r.decision).map((r) => ({ postId: r.postId, ...r.decision! }));
  const approved = decisions.filter((d) => !d.skip);
  console.log(`${channel.name}: committing ${approved.length} of ${decisions.length} decisions → ${SITE}`);
  const results: Array<Record<string, unknown>> = [];
  await pool(approved, 2, async (d) => {
    const doc = docs.find((x) => x.postId === d.postId);
    try {
      if (!doc?.path) throw new Error("no such document in the export");
      const form = formFor(channel, doc, readFileSync(doc.path));
      form.set("decision", JSON.stringify({ course: d.course, type: d.type, title: d.title, term: d.term ?? null, week: d.week ?? null, exam: d.exam ?? null }));
      results.push({ postId: d.postId, ...(await post("/api/admin/import/commit", form)) });
    } catch (error) {
      results.push({ postId: d.postId, result: "error", error: error instanceof Error ? error.message : String(error) });
    }
    process.stdout.write(".");
  });
  process.stdout.write("\n");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "commit-result.json"), JSON.stringify(results.sort((a, b) => Number(a.postId) - Number(b.postId)), null, 2));
  const by = results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [String(r.result)]: (acc[String(r.result)] ?? 0) + 1 }), {});
  console.log(by);
  console.log(`Results written to ${join(out, "commit-result.json")}`);
}

async function main() {
  const { dir, mode, out, decisions } = args();
  if (mode === "plan") await plan(dir, out);
  else await commit(dir, decisions!, out);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
