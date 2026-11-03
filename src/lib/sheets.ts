import { inflateRawSync } from "node:zlib";
import { SheetError, type Grid, type Tab } from "@/core/exams";

/**
 * Spreadsheets as plain grids, from a Google Sheets link or an uploaded file
 * (.xlsx, .csv, or a sheet's HTML view). Merged cells are filled with their
 * value so every row reads on its own. Nothing here is stored: the grids live
 * for one import and only the exams read from them are kept.
 */

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 6000;
const MAX_COLS = 200;

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENT[e.toLowerCase()] ?? m;
  });

/** Cells as text, merged areas filled with their top-left value. */
function grid(cells: Map<string, string>, merges: Array<[number, number, number, number]>): Grid {
  for (const [r1, c1, r2, c2] of merges) {
    const v = cells.get(`${r1}:${c1}`) ?? "";
    if (!v) continue;
    for (let r = r1; r <= Math.min(r2, MAX_ROWS - 1); r++) for (let c = c1; c <= Math.min(c2, MAX_COLS - 1); c++) if (!cells.get(`${r}:${c}`)) cells.set(`${r}:${c}`, v);
  }
  let rows = 0, cols = 0;
  for (const k of cells.keys()) {
    const [r, c] = k.split(":").map(Number);
    rows = Math.max(rows, r + 1);
    cols = Math.max(cols, c + 1);
  }
  const out: Grid = Array.from({ length: Math.min(rows, MAX_ROWS) }, () => Array<string>(Math.min(cols, MAX_COLS)).fill(""));
  for (const [k, v] of cells) {
    const [r, c] = k.split(":").map(Number);
    if (r < MAX_ROWS && c < MAX_COLS) out[r][c] = v;
  }
  return out;
}

/* ───────────── CSV ───────────── */

export function readCsv(text: string): Grid {
  const rows: Grid = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  const sep = (s.split("\n")[0].match(/;/g)?.length ?? 0) > (s.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
      if (rows.length >= MAX_ROWS) break;
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.slice(0, MAX_COLS).map((c) => c.trim()));
}

/* ───────────── HTML (a sheet's /htmlview, or a saved web page) ───────────── */

const cellText = (html: string) => decode(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

/** The first data table in an HTML page; Google's row/column headers and freeze bars are left out. */
export function readHtmlTable(html: string): Grid {
  const body = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(html)?.[1] ?? /<table[^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1] ?? "";
  const cells = new Map<string, string>();
  const merges: Array<[number, number, number, number]> = [];
  const taken = new Set<string>();
  let r = 0;
  for (const tr of body.split(/<tr\b[^>]*>/i).slice(1)) {
    const tds = [...tr.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)].filter((m) => !/freezebar/i.test(m[1]));
    if (!tds.length) continue;
    let c = 0;
    for (const [, attrs, inner] of tds) {
      while (taken.has(`${r}:${c}`)) c++;
      const rs = Number(/rowspan="?(\d+)/i.exec(attrs)?.[1] ?? 1);
      const cs = Number(/colspan="?(\d+)/i.exec(attrs)?.[1] ?? 1);
      const v = cellText(inner);
      if (v) cells.set(`${r}:${c}`, v);
      for (let a = 0; a < rs; a++) for (let b = 0; b < cs; b++) taken.add(`${r + a}:${c + b}`);
      if (rs > 1 || cs > 1) merges.push([r, c, r + rs - 1, c + cs - 1]);
      c += cs;
    }
    r++;
    if (r >= MAX_ROWS) break;
  }
  return grid(cells, merges);
}

/* ───────────── XLSX (zip of XML) ───────────── */

function unzip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new SheetError("This file is not an .xlsx workbook");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extra + comment;
    if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(data, { maxOutputLength: 200 * 1024 * 1024 }) : data);
  }
  return files;
}

const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const ref = (a1: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(a1);
  return m ? [Number(m[2]) - 1, colIndex(m[1])] as const : null;
};

export function readXlsx(bytes: Uint8Array): Tab[] {
  const files = unzip(Buffer.from(bytes));
  const wb = files.get("xl/workbook.xml")?.toString("utf8");
  if (!wb) throw new SheetError("This file is not an .xlsx workbook");
  const rels = new Map([...(files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [/Id="([^"]+)"/.exec(m[0])?.[1] ?? "", /Target="([^"]+)"/.exec(m[0])?.[1] ?? ""]));
  const shared = [...(files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const tabs: Tab[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(/name="([^"]*)"/.exec(m[0])?.[1] ?? "Sheet");
    if (/state="(hidden|veryHidden)"/.test(m[0])) continue;
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1] ?? "";
    const target = (rels.get(rid) ?? "").replace(/^\/?(xl\/)?/, "");
    const xml = files.get(`xl/${target}`)?.toString("utf8");
    if (!xml) continue;
    const cells = new Map<string, string>();
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = ref(/r="([A-Z]+\d+)"/.exec(c[1])?.[1] ?? "");
      if (!at || at[0] >= MAX_ROWS || at[1] >= MAX_COLS) continue;
      const type = /t="([^"]+)"/.exec(c[1])?.[1];
      const inner = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let text = "";
      if (type === "s" && v !== undefined) text = shared[Number(v)] ?? "";
      else if (type === "inlineStr") text = decode([...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
      else if (v !== undefined) text = decode(v);
      text = text.replace(/\s+/g, " ").trim();
      if (text) cells.set(`${at[0]}:${at[1]}`, text);
    }
    const merges: Array<[number, number, number, number]> = [];
    for (const mc of xml.matchAll(/<mergeCell\b[^>]*ref="([A-Z]+\d+):([A-Z]+\d+)"/g)) {
      const a = ref(mc[1]);
      const b = ref(mc[2]);
      if (a && b) merges.push([a[0], a[1], b[0], b[1]]);
    }
    tabs.push({ name, rows: grid(cells, merges) });
  }
  if (!tabs.length) throw new SheetError("The workbook has no sheets");
  return tabs;
}

/** An uploaded file by its name: .xlsx, .csv (one tab, named after the file) or .html. */
export function readUpload(fileName: string, bytes: Uint8Array): Tab[] {
  if (bytes.byteLength > MAX_BYTES) throw new SheetError("The file is too large (15 MB at most)");
  const lower = fileName.toLowerCase();
  const base = fileName.replace(/\.[^.]+$/, "") || "Sheet";
  if (lower.endsWith(".xlsx") || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return readXlsx(bytes);
  const text = new TextDecoder("utf-8").decode(bytes);
  if (lower.endsWith(".html") || lower.endsWith(".htm") || /^\s*<(!doctype|html|table)/i.test(text)) return [{ name: base, rows: readHtmlTable(text) }];
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) return [{ name: base, rows: lower.endsWith(".tsv") ? text.split(/\r?\n/).map((l) => l.split("\t")) : readCsv(text) }];
  throw new SheetError("Upload an .xlsx, .csv or .html file");
}

/* ───────────── Google Sheets ───────────── */

export const sheetIdOf = (url: string) => /docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/.exec(url)?.[1] ?? null;

const NOT_SHARED = "The server can't open this sheet: it isn't shared with \"anyone with the link\". Download it (File → Download → .xlsx) and upload the file instead.";

async function get(url: string, fetcher: typeof fetch) {
  const res = await fetcher(url, { redirect: "follow", headers: { "user-agent": "PressF exam schedule reader" }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 401 || res.status === 403 || /accounts\.google\.com/.test(res.url)) return null;
  if (!res.ok) throw new SheetError(`Google Sheets answered ${res.status}`);
  return res;
}

/**
 * The sheet's tabs from a "anyone with the link" Google Sheet: the .xlsx export
 * when downloads are allowed, else each tab's HTML view (which still works when
 * the owner turned downloads off for viewers).
 */
export async function fetchSheet(url: string, fetcher: typeof fetch = fetch): Promise<Tab[]> {
  const id = sheetIdOf(url);
  if (!id) throw new SheetError("That isn't a Google Sheets link");
  const base = `https://docs.google.com/spreadsheets/d/${id}`;
  const xlsx = await get(`${base}/export?format=xlsx`, fetcher);
  if (xlsx && /spreadsheetml|octet-stream|zip/.test(xlsx.headers.get("content-type") ?? "")) {
    const bytes = new Uint8Array(await xlsx.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new SheetError("The sheet is too large");
    return readXlsx(bytes);
  }
  const view = await get(`${base}/htmlview`, fetcher);
  if (!view) throw new SheetError(NOT_SHARED);
  const html = await view.text();
  const items = [...html.matchAll(/items\.push\(\{name: "((?:[^"\\]|\\.)*)"[^}]*?gid: "(\d+)"/g)].map((m) => ({ name: JSON.parse(`"${m[1]}"`) as string, gid: m[2] }));
  if (!items.length) {
    if (/<tbody/i.test(html)) return [{ name: "Sheet1", rows: readHtmlTable(html) }];
    throw new SheetError(NOT_SHARED);
  }
  const tabs: Tab[] = [];
  for (const it of items.slice(0, 20)) {
    const res = await get(`${base}/htmlview/sheet?headers=true&gid=${it.gid}`, fetcher);
    if (!res) throw new SheetError(NOT_SHARED);
    tabs.push({ name: it.name, rows: readHtmlTable(await res.text()) });
  }
  return tabs;
}
