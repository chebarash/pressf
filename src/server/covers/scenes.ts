import { C, type FontKey } from "./assets";
import type { Prim, Scene } from "./draw";
import { SCAN_NOTE, SITE_HOST, detailRows, legalNote, subtitle, tags, weekLine, type CoverMeta } from "./meta";
import { ellipsize, measure, normalLineHeight, titleLines, wrap } from "./text";

/**
 * Cover layouts from Figma (page 10 Redesign, section 12), in design units.
 * Each takes the page size in design units: A4 is 595×842, slides 1280×720.
 * Other sizes keep the paddings and stretch the spacer, as auto layout does.
 */

const TINT = { teal: C.teal, mustard: C.mustard, rust: C.rust, plum: C.plum };

type Chip = { label: string; fill: keyof typeof TINT };

/** Keycap chips in a row; returns the row height. */
function chips(out: Prim[], list: Chip[], x: number, y: number, o: { size: number; px: number; py: number; r: number; shadow: number; gap: number; maxRight: number }) {
  const lh = normalLineHeight("semibold", o.size);
  const h = o.py * 2 + lh + 3;
  for (const c of list) {
    const label = ellipsize(c.label, "semibold", o.size, Math.max(20, o.maxRight - x - o.px * 2 - 3));
    const w = measure(label, "semibold", o.size) + o.px * 2 + 3;
    if (x + w > o.maxRight) break;
    out.push({ k: "rect", x, y, w, h, fill: TINT[c.fill], stroke: C.strong, sw: 1.5, r: o.r, shadow: o.shadow });
    out.push({ k: "text", x: x + o.px + 1.5, top: y + o.py + 1.5, lh, size: o.size, font: "semibold", color: C.ink, text: label });
    x += w + o.gap;
  }
  return h;
}

function text(out: Prim[], s: string, x: number, top: number, size: number, font: FontKey, color: string, lh = normalLineHeight(font, size)) {
  out.push({ k: "text", x, top, lh, size, font, color, text: s });
  return lh;
}

/** A paragraph wrapped to `width`; returns its height. */
function para(out: Prim[], s: string, x: number, top: number, width: number, size: number, font: FontKey, color: string, lhRatio?: number) {
  const lh = lhRatio ? size * lhRatio : normalLineHeight(font, size);
  const lines = wrap(s, font, size, width);
  lines.forEach((l, i) => text(out, l, x, top + i * lh, size, font, color, lh));
  return lines.length * lh;
}

/** Brand strip of the A4 covers: mascot, "Press F", spacer, site. */
function brandA4(out: Prim[], x: number, y: number, right: number, opts: { site?: boolean } = {}) {
  const h = 26.4;
  out.push({ k: "image", x, y, w: h, h, src: "mascot" });
  const lh = 19.2 * 1.15;
  text(out, "Press F", x + h + 8, y + (h - lh) / 2, 19.2, "serif", C.ink, lh);
  if (opts.site !== false) {
    const lh2 = normalLineHeight("medium", 11);
    text(out, SITE_HOST, right - measure(SITE_HOST, "medium", 11), y + (h - lh2) / 2, 11, "medium", C.secondary, lh2);
  }
  return h;
}

/** Fits a serif title: shrinks until it takes at most `maxLines` lines and `maxHeight`. */
function fitTitle(s: string, width: number, start: number, min: number, lhRatio: number, maxLines: number, maxHeight: number) {
  for (let size = start; size >= min; size -= 2) {
    const lines = titleLines(s, "serif", size, width);
    if (lines.length <= maxLines && lines.length * size * lhRatio <= maxHeight) return { size, lines };
  }
  const lines = wrap(s, "serif", min, width).slice(0, maxLines);
  lines[maxLines - 1] = ellipsize(lines[maxLines - 1] ?? "", "serif", min, width);
  return { size: min, lines };
}

/** Cover/A4 · LMS, · From students, · Past exam (by `meta.source`). */
export function a4Cover(meta: CoverMeta, W = 595, H = 842): Scene {
  const out: Prim[] = [{ k: "rect", x: 0, y: 0, w: W, h: H, fill: C.page }];
  const P = 48;
  const inner = W - P * 2;
  let y = P;
  y += brandA4(out, P, y, W - P);
  y += 28;
  y += chips(out, tags(meta), P, y, { size: 11, px: 8, py: 4, r: 6.05, shadow: 2, gap: 8, maxRight: W - P });
  y += 18;
  const titleTop = y;

  // Bottom block first, so the title knows how much room it has.
  const qr = 84;
  const noteW = inner - qr - 16;
  const nlh = 11 * 1.32;
  // Figma rounds text box heights up to whole pixels.
  const n1 = Math.ceil(wrap(SCAN_NOTE, "medium", 11, noteW).length * nlh);
  const n2 = Math.ceil(wrap(legalNote(meta), "regular", 11, noteW).length * nlh);
  const noteH = n1 + 4 + n2;
  const footerH = Math.max(qr, noteH);
  const footerTop = H - P - footerH;
  const rows = detailRows(meta, meta.pages);
  const rowH = 27;
  const detailsTop = footerTop - 24 - rows.length * rowH;

  const sub = subtitle(meta);
  const subH = normalLineHeight("medium", 18);
  const room = detailsTop - titleTop - 12 - subH - 24;
  const t = fitTitle(meta.title, inner, 64, 36, 0.95, 3, room);
  const tlh = t.size * 0.95;
  t.lines.forEach((l, i) => text(out, l, P, y + i * tlh, t.size, "serif", C.ink, tlh));
  y += t.lines.length * tlh + 12;
  text(out, ellipsize(sub, "medium", 18, inner), P, y, 18, "medium", C.secondary, subH);

  rows.forEach(([label, value], i) => {
    const top = detailsTop + i * rowH;
    out.push({ k: "rect", x: P, y: top, w: inner, h: 1, fill: C.subtle });
    const lh = normalLineHeight("medium", 11);
    const ty = top + 1 + 6 + (14 - lh) / 2;
    text(out, label, P, ty, 11, "medium", C.secondary, lh);
    text(out, ellipsize(value, "semibold", 11, inner - 98), P + 98, ty, 11, "semibold", C.ink, lh);
  });

  // Footer: notes bottom-aligned on the left, QR on the right.
  const noteTop = H - P - noteH;
  para(out, SCAN_NOTE, P, noteTop, noteW, 11, "medium", C.ink, 1.32);
  para(out, legalNote(meta), P, noteTop + n1 + 4, noteW, 11, "regular", C.secondary, 1.32);
  const qx = W - P - qr;
  const qy = H - P - qr;
  qrTile(out, meta.url, qx, qy, qr);
  return { w: W, h: H, prims: out };
}

function qrTile(out: Prim[], url: string, x: number, y: number, size: number) {
  out.push({ k: "rect", x, y, w: size, h: size, fill: C.docPage, stroke: C.strong, sw: 1.25, r: 6 });
  const inset = size * (2.76 / 84) + 1.25;
  out.push({ k: "qr", x: x + inset, y: y + inset, size: size - inset * 2, text: url });
}

/** Cover/Slide 16:9 — PowerPoint and landscape PDFs. */
export function slideCover(meta: CoverMeta, W = 1280, H = 720, follow?: number | null): Scene {
  const out: Prim[] = [{ k: "rect", x: 0, y: 0, w: W, h: H, fill: C.page }];
  const PX = 72;
  const PY = 64;
  const rightW = Math.max(156, measure(SITE_HOST, "medium", 16));
  const leftW = W - PX * 2 - 64 - rightW;
  // Brand
  out.push({ k: "image", x: PX, y: PY, w: 56, h: 56, src: "mascot" });
  text(out, "Press F", PX + 56 + 17, PY + (56 - 43.2) / 2, 40, "serif", C.ink, 43.2);

  // Bottom-up: subtitle, title, gap, tags.
  const parts = [meta.courseName, meta.source === "lms" ? meta.teacher : null, meta.source === "lms" ? "from NewUU LMS" : meta.source === "exam" ? "past exam from students" : "from students", follow ? `${follow} ${follow === 1 ? "slide follows" : "slides follow"}` : null];
  const sub = ellipsize(parts.filter(Boolean).join(" · "), "medium", 22, leftW);
  const subH = normalLineHeight("medium", 22);
  let bottom = H - PY;
  text(out, sub, PX, bottom - subH, 22, "medium", C.secondary, subH);
  bottom -= subH + 4;
  const t = fitTitle(meta.title, leftW, 96, 48, 1.04, 2, H - PY * 2 - 56 - 31 - 20 - subH - 40);
  const tlh = t.size * 1.04;
  const titleTop = bottom - t.lines.length * tlh;
  t.lines.forEach((l, i) => text(out, l, PX, titleTop + i * tlh, t.size, "serif", C.ink, tlh));
  bottom = titleTop - 4 - 20 - 4;
  const wk = weekLine(meta);
  const second = meta.source === "exam" ? "Past exam" : [wk ? `Week ${wk}` : null, meta.kind].filter(Boolean).join(" · ");
  const list: Chip[] = [];
  if (meta.courseCode) list.push({ label: meta.courseCode, fill: "teal" });
  if (second) list.push({ label: second, fill: meta.source === "exam" ? "rust" : "mustard" });
  if (meta.source !== "lms") list.push({ label: "From students", fill: "plum" });
  const chipH = 4 * 2 + normalLineHeight("semibold", 16) + 3;
  chips(out, list, PX, bottom - chipH, { size: 16, px: 12, py: 4, r: 8.8, shadow: 2.67, gap: 10, maxRight: PX + leftW });

  // Right column: QR above the site, bottom-right.
  const urlH = normalLineHeight("medium", 16);
  text(out, SITE_HOST, W - PX - measure(SITE_HOST, "medium", 16), H - PY - urlH, 16, "medium", C.secondary, urlH);
  qrTile(out, meta.url, W - PX - 150, H - PY - urlH - 12 - 150, 150);
  return { w: W, h: H, prims: out };
}

/** Cover/Page stamp — a footer line inside the bottom margin of an original page (page units). */
export function pageStamp(meta: CoverMeta, W: number, H: number, page: number, pages: number, margin: number): Scene {
  const out: Prim[] = [];
  const P = Math.min(48, W * 0.08);
  const lh = normalLineHeight("medium", 11);
  // Design: 8 above the line of text, 14 below it, a hairline on top; tighter margins drop the hairline.
  const full = margin >= 37;
  const top = full ? H - 14 - lh : H - margin / 2 - lh / 2;
  if (full) out.push({ k: "rect", x: P, y: H - 37, w: W - P * 2, h: 1, fill: C.docLine });
  out.push({ k: "image", x: P, y: top + (lh - 14) / 2, w: 14, h: 14, src: "mascot" });
  const right = `${page} / ${pages}`;
  const rw = measure(right, "medium", 11);
  const label = ellipsize(["Press F", meta.courseName, meta.week != null ? `Week ${meta.week}` : null].filter(Boolean).join(" · "), "medium", 11, W - P * 2 - 20 - rw - 12);
  text(out, label, P + 20, top, 11, "medium", C.docInk, lh);
  text(out, right, W - P - rw, top, 11, "medium", C.docInk, lh);
  return { w: W, h: H, prims: out };
}

export type ArchiveEntry = { name: string; size: number };

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export const README_NAME = "Press F — about this archive.pdf";

/** Cover/Archive README — the one PDF added to a zip. */
export function archiveReadme(meta: CoverMeta, entries: ArchiveEntry[], W = 595, H = 842): Scene {
  const out: Prim[] = [{ k: "rect", x: 0, y: 0, w: W, h: H, fill: C.page }];
  const P = 48;
  const inner = W - P * 2;
  let y = P;
  y += brandA4(out, P, y, W - P) + 14 + 20 + 14;
  const t = fitTitle(meta.title, inner, 52, 32, 1.04, 2, 120);
  const tlh = t.size * 1.04;
  t.lines.forEach((l, i) => text(out, l, P, y + i * tlh, t.size, "serif", C.ink, tlh));
  y += t.lines.length * tlh + 14;
  const sub = [meta.courseName, meta.week != null ? `Week ${meta.week}` : null, meta.source === "lms" ? "from NewUU LMS" : "from students"].filter(Boolean).join(" · ");
  y += text(out, ellipsize(sub, "medium", 16, inner), P, y, 16, "medium", C.secondary) + 14;
  y += text(out, "INSIDE THIS ARCHIVE", P, y, 11, "semibold", C.secondary) + 10;

  const footerTop = H - P - 72;
  const rowH = 32;
  const fit = Math.max(1, Math.floor((footerTop - 28 - y + 10) / (rowH + 10)));
  const files = entries.filter((e) => !e.name.endsWith("/"));
  const shown = files.length > fit ? files.slice(0, fit - 1) : files;
  const rows: Array<[string, string]> = shown.map((e) => [e.name, kb(e.size)]);
  if (files.length > shown.length) rows.push([`and ${files.length - shown.length} more`, kb(files.slice(shown.length).reduce((a, e) => a + e.size, 0))]);
  const lh = normalLineHeight("medium", 12);
  for (const [name, size] of rows) {
    out.push({ k: "rect", x: P, y, w: inner, h: 1, fill: C.subtle });
    const ty = y + 1 + 8 + (15 - lh) / 2;
    text(out, ellipsize(name, "medium", 12, 230), P, ty, 12, "medium", C.secondary, lh);
    text(out, ellipsize(size, "semibold", 12, inner - 240), P + 240, ty, 12, "semibold", C.ink, lh);
    y += rowH + 10;
  }

  const note = `Added by Press F as '${README_NAME}'. Everything else is exactly as uploaded.`;
  const noteW = inner - 72 - 16;
  const lines = wrap(note, "regular", 11, noteW);
  const nlh = 11 * 1.32;
  lines.forEach((l, i) => text(out, l, P, H - P - (lines.length - i) * nlh, 11, "regular", C.secondary, nlh));
  qrTile(out, meta.url, W - P - 72, H - P - 72, 72);
  return { w: W, h: H, prims: out };
}
