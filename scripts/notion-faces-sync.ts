import "dotenv/config";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse, type Node } from "acorn";

/**
 * Brings the Notion Faces part library (faces.notion.com) into Press F.
 * The owner confirmed the use of Notion Faces' artwork is agreed (2026-11-04).
 *
 *   npx tsx scripts/notion-faces-sync.ts            download parts, write the data and thumbnails
 *   railway run npx tsx scripts/notion-faces-sync.ts --upload    …and copy the parts to the bucket
 *
 * 1. Reads the site's JS bundle (never runs it: the part list is read from the
 *    parsed source) for the categories, part ids, labels, tags, tile previews
 *    and the per-part margins Notion frames a portrait with, and writes
 *    src/core/notion-faces/parts.ts.
 * 2. Downloads every part PNG (1200×1200, transparent) one at a time into
 *    .cache/notion-faces/<category>/<id>.png, skipping files it already has.
 * 3. Writes small thumbnails for the admin constructor to public/notion-faces/.
 * 4. With --upload, puts each part in the bucket at faces/notion/<category>/<id>.png
 *    (skipping ones already there); the server composes faces from those.
 * Re-runnable: every step skips work already done (--force redoes thumbnails).
 */
const SITE = "https://faces.notion.com";
const UA = "pressf-faces-sync (+https://pressf.chebarash.uz)";
const CACHE = ".cache/notion-faces";
const THUMBS = "public/notion-faces";
const THUMB_PX = 160;
const OUT = "src/core/notion-faces/parts.ts";
const args = new Set(process.argv.slice(2));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
    if (res.status === 404 || attempt >= 4) throw new Error(`${res.status} ${url}`);
    await sleep(2000 * attempt);
  }
}
const exists = (p: string) => stat(p).then(() => true, () => false);

/* ───────── the bundle, read statically ───────── */

type N = Node & Record<string, any>;
type Env = { vars: Map<string, N>; parent: Env | null; values: Map<string, unknown> };
const INTL = Symbol("intl");

function walk(node: unknown, visit: (n: N) => void) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  const n = node as N;
  if (typeof n.type === "string") visit(n);
  for (const [k, v] of Object.entries(n)) if (k !== "loc" && v && typeof v === "object") walk(v, visit);
}

/** Collects `let/var/const` declarators of a block (not nested functions). */
function scope(body: N[], parent: Env | null): Env {
  const env: Env = { vars: new Map(), parent, values: new Map() };
  for (const st of body) if (st.type === "VariableDeclaration") for (const d of st.declarations) if (d.id.type === "Identifier" && d.init) env.vars.set(d.id.name, d.init);
  return env;
}

function lookup(name: string, env: Env | null): unknown {
  for (let e = env; e; e = e.parent) {
    if (e.values.has(name)) return e.values.get(name);
    const init = e.vars.get(name);
    if (init) {
      const v = evaluate(init, e);
      e.values.set(name, v);
      return v;
    }
  }
  return undefined;
}

/** Evaluates the literal-ish expressions the part data is written in. Anything else is undefined. */
function evaluate(n: N, env: Env): unknown {
  switch (n.type) {
    case "Literal":
      return n.value;
    case "TemplateLiteral":
      return n.expressions.length ? undefined : n.quasis[0].value.cooked;
    case "Identifier":
      return n.name === "undefined" ? undefined : lookup(n.name, env);
    case "UnaryExpression": {
      const v = evaluate(n.argument, env);
      return n.operator === "-" ? -(v as number) : n.operator === "!" ? !v : n.operator === "+" ? +(v as number) : undefined;
    }
    case "ArrayExpression": {
      const out: unknown[] = [];
      for (const el of n.elements) {
        if (!el) continue;
        if (el.type === "SpreadElement") out.push(...((evaluate(el.argument, env) as unknown[]) ?? []));
        else out.push(evaluate(el, env));
      }
      return out;
    }
    case "ObjectExpression": {
      const out: Record<string, unknown> = {};
      for (const p of n.properties) {
        if (p.type === "SpreadElement") Object.assign(out, evaluate(p.argument, env) ?? {});
        else out[p.key.type === "Identifier" && !p.computed ? p.key.name : String(evaluate(p.key, env))] = evaluate(p.value, env);
      }
      return out;
    }
    case "ConditionalExpression":
      return evaluate(n.test, env) ? evaluate(n.consequent, env) : evaluate(n.alternate, env);
    case "LogicalExpression": {
      const l = evaluate(n.left, env);
      return n.operator === "&&" ? l && evaluate(n.right, env) : n.operator === "||" ? l || evaluate(n.right, env) : l ?? evaluate(n.right, env);
    }
    case "SequenceExpression":
      return evaluate(n.expressions[n.expressions.length - 1], env);
    case "MemberExpression": {
      const obj = evaluate(n.object, env);
      const key = n.computed ? evaluate(n.property, env) : n.property.name;
      if (obj === INTL || obj == null || typeof obj !== "object") return undefined;
      return (obj as Record<string, unknown>)[key as string];
    }
    case "CallExpression": {
      // intl.formatMessage({ defaultMessage }) → the English text.
      if (n.callee.type === "MemberExpression" && !n.callee.computed && n.callee.property.name === "formatMessage") {
        const msg = evaluate(n.arguments[0], env) as { defaultMessage?: string } | undefined;
        return msg?.defaultMessage;
      }
      // (e => …)(intl): the part lists are written as immediately-called arrows.
      if (n.callee.type === "ArrowFunctionExpression" || n.callee.type === "FunctionExpression") return call(n.callee, env);
      // defineMessages({ … }) is the identity: keep its one object argument.
      if (n.arguments.length === 1 && n.arguments[0].type === "ObjectExpression") return evaluate(n.arguments[0], env);
      return undefined;
    }
    case "ArrowFunctionExpression":
    case "FunctionExpression":
      return undefined;
    default:
      return undefined;
  }
}

/** Calls a function node with the intl object for every parameter; returns what it returns. */
function call(fn: N, env: Env): unknown {
  const params: Env = { vars: new Map(), parent: env, values: new Map(fn.params.map((p: N) => [p.name, INTL])) };
  if (fn.body.type !== "BlockStatement") return evaluate(fn.body, params);
  const inner = scope(fn.body.body, params);
  const ret = fn.body.body.find((s: N) => s.type === "ReturnStatement");
  return ret?.argument ? evaluate(ret.argument, inner) : undefined;
}

type Preview = { scale?: number; x?: number; y?: number };
type Layer = { id: number; label: string; previewTransform?: Preview; colorTags?: string[]; styleTags?: string[] };
type Category = { name: string; key: string; shortParam: string; path: string; layers: Layer[] };
type Margins = Record<string, Record<string, { top: number; right: number; bottom: number; left: number }>>;

/** Finds the bundle module with the part data and reads the categories and the margin table out of it. */
function readParts(source: string): { categories: Category[]; margins: Margins; tags: Record<string, string> } {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "script" }) as N;
  let found: N | null = null;
  walk(ast, (n) => {
    if (found || n.type !== "Property" || (n.value.type !== "ArrowFunctionExpression" && n.value.type !== "FunctionExpression")) return;
    const body = source.slice(n.value.start, n.value.end);
    if (body.includes('"category.skintone"') && body.includes("shortParam")) found = n.value;
  });
  if (!found) throw new Error("The part data module was not found in the bundle");
  const mod = found as N;
  const env = scope(mod.body.body, null);
  let categories: Category[] | null = null;
  let margins: Margins | null = null;
  const fns: N[] = (mod.body.body as N[]).filter((st) => st.type === "FunctionDeclaration");
  for (const init of env.vars.values()) if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") fns.push(init);
  // The categories factory: called with intl, it returns { skintone: { shortParam, layers }, … }.
  for (const fn of fns) {
    if (categories) break;
    const ret = call(fn, env) as Record<string, Category> | undefined;
    if (ret && typeof ret === "object" && ret.skintone?.shortParam && Array.isArray(ret.skintone.layers)) categories = Object.values(ret);
  }
  let tags: Record<string, string> = {};
  for (const [name, init] of env.vars) {
    if (init.type !== "ObjectExpression" && init.type !== "CallExpression") continue;
    const v = lookup(name, env) as Record<string, unknown> | undefined;
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const skin = (v as Margins).skintone;
    if (skin && typeof skin === "object" && "1" in skin && "top" in (skin["1"] as object)) margins = v as Margins;
    // The hair filter labels: { short: { id: "layerTag.short", defaultMessage: "Short" }, … }.
    const msgs = Object.entries(v).filter(([, m]) => typeof (m as { id?: unknown })?.id === "string" && (m as { id: string }).id.startsWith("layerTag."));
    if (msgs.length) tags = Object.fromEntries(msgs.map(([k, m]) => [k, (m as { defaultMessage: string }).defaultMessage]));
  }
  if (!categories || !margins) throw new Error("Categories or margins missing from the part data module");
  return { categories, margins, tags };
}

async function bundleParts() {
  const html = new TextDecoder().decode(await get(`${SITE}/`));
  const chunks = [...new Set(html.match(/\/_next\/static\/chunks\/[\w\-/().]+\.js/g) ?? [])];
  for (const path of chunks) {
    const source = new TextDecoder().decode(await get(SITE + path));
    await sleep(100);
    if (source.includes('"category.skintone"') && source.includes("shortParam")) return { path, ...readParts(source) };
  }
  throw new Error("No bundle chunk has the part data");
}

/* ───────── output ───────── */

function dataFile(categories: Category[], margins: Margins, tags: Record<string, string>, chunk: string) {
  const lines: string[] = [];
  lines.push(
    "/**",
    " * Notion Faces part library — GENERATED by scripts/notion-faces-sync.ts; do not edit by hand.",
    " *",
    " * Source: Notion Faces (https://faces.notion.com), © Notion Labs, Inc. The part artwork",
    " * (faces/notion/<category>/<id>.png in the bucket, thumbnails in public/notion-faces/) and",
    " * this data (categories, part ids, labels, tags, tile previews, margins) are Notion's.",
    " * The owner of Press F confirmed the use is agreed (2026-11-04). Not covered by the",
    " * repository's own licence.",
    ` * Read from ${chunk}.`,
    " */",
    "",
    "export type NotionPreview = { scale?: number; x?: number; y?: number };",
    "export type NotionPart = { id: number; label: string; preview?: NotionPreview; color?: string[]; style?: string[] };",
    "export type NotionCategory = { key: string; param: string; label: string; parts: NotionPart[] };",
    "/** Notion's margins around each part's drawing in its 1200×1200 frame: [top, right, bottom, left]. */",
    "export type NotionMargins = Record<string, Record<number, [number, number, number, number]>>;",
    "",
    "/** The categories in Notion's sidebar order, each with its parts in Notion's tile order. */",
    "export const NOTION_CATEGORIES: NotionCategory[] = [",
  );
  for (const c of categories) {
    lines.push(`  {`, `    key: ${JSON.stringify(c.path)},`, `    param: ${JSON.stringify(c.shortParam)},`, `    label: ${JSON.stringify(c.name)},`, `    parts: [`);
    for (const l of c.layers) {
      const part: Record<string, unknown> = { id: l.id, label: l.label };
      if (l.previewTransform && Object.keys(l.previewTransform).length) part.preview = l.previewTransform;
      if (l.colorTags?.length) part.color = l.colorTags;
      if (l.styleTags?.length) part.style = l.styleTags;
      lines.push(`      ${JSON.stringify(part)},`);
    }
    lines.push(`    ],`, `  },`);
  }
  lines.push("];", "", "/** Labels of the hair filters (style: short, long, covered; colour: light, medium, dark). */", `export const NOTION_TAGS: Record<string, string> = ${JSON.stringify(tags)};`, "", "export const NOTION_MARGINS: NotionMargins = {");
  for (const [key, table] of Object.entries(margins)) {
    lines.push(`  ${key}: {`);
    for (const [id, m] of Object.entries(table)) lines.push(`    ${id}: [${m.top}, ${m.right}, ${m.bottom}, ${m.left}],`);
    lines.push(`  },`);
  }
  lines.push("};", "");
  return lines.join("\n");
}

async function main() {
  console.log("Reading the bundle…");
  const { path, categories, margins, tags } = await bundleParts();
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, dataFile(categories, margins, tags, path));
  console.log(`Wrote ${OUT}: ${categories.map((c) => `${c.path} ${c.layers.length}`).join(", ")}`);

  // Every part Notion lists, plus any it has margins for (a few are kept but not offered).
  const wanted = new Map<string, Set<number>>();
  for (const c of categories) wanted.set(c.path, new Set(c.layers.map((l) => l.id)));
  for (const [key, table] of Object.entries(margins)) for (const id of Object.keys(table)) wanted.get(key)?.add(Number(id));

  const { decodePng, encodePng, shrink } = await import("../src/lib/png");
  const storage = args.has("--upload") ? await import("../src/lib/storage") : null;
  let downloaded = 0, uploaded = 0, thumbs = 0, bytes = 0, missing = 0;
  for (const [key, ids] of wanted) {
    for (const id of [...ids].sort((a, b) => a - b)) {
      const file = join(CACHE, key, `${id}.png`);
      if (!(await exists(file))) {
        try {
          const body = await get(`${SITE}/layers/${key}/${id}.png`);
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, body);
          downloaded++;
          await sleep(150); // one at a time, gently
        } catch (e) {
          console.warn(`skip ${key}/${id}: ${(e as Error).message}`);
          missing++;
          continue;
        }
      }
      const body = new Uint8Array(await readFile(file));
      bytes += body.length;
      const thumb = join(THUMBS, key, `${id}.png`);
      if (args.has("--force") || !(await exists(thumb))) {
        await mkdir(dirname(thumb), { recursive: true });
        await writeFile(thumb, encodePng(shrink(decodePng(body), THUMB_PX)));
        thumbs++;
      }
      if (storage) {
        const objectKey = `faces/notion/${key}/${id}.png`;
        if (!(await storage.objectExists(objectKey))) {
          await storage.putObject(objectKey, Buffer.from(body), "image/png");
          uploaded++;
        }
      }
    }
  }
  console.log(`Parts: ${downloaded} downloaded, ${missing} missing, ${(bytes / 1048576).toFixed(1)} MB in ${CACHE}; ${thumbs} thumbnails written; ${storage ? `${uploaded} uploaded` : "not uploaded (pass --upload)"}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
