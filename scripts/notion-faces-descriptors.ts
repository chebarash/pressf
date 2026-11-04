import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NOTION_CATEGORIES } from "../src/core/notion-faces/parts";
import { decodePng, type Rgba } from "../src/lib/png";

/**
 * Measures every Notion Faces part once, offline, for "From a photo" in the
 * admin constructor (src/core/notion-faces/match.ts ranks parts by these).
 *
 *   npx tsx scripts/notion-faces-sync.ts           (first: the 1200×1200 parts in .cache/notion-faces)
 *   npx tsx scripts/notion-faces-descriptors.ts    writes src/core/notion-faces/descriptors.ts
 *
 * Only skin tone and hair carry Notion's own tags; for the rest each part is
 * described by its drawing: bounding box, ink area and darkness, left/right
 * symmetry, and a few measures per category (eye openness, brow thickness and
 * arch, mouth width and curve, beard and moustache ink, lens fill, hair
 * volume, length, bun and curl). Lengths are in head widths (the skin part is
 * 700 px wide in the 1200 frame), so they compare across categories.
 *
 * A short hand list (NOVELTY) marks the joke parts (props, hearts, spirals,
 * masks, hats with ears…) that a photo should never suggest; they stay in the
 * constructor. Re-runnable; the output is deterministic.
 */
const CACHE = ".cache/notion-faces";
const OUT = "src/core/notion-faces/descriptors.ts";

// The head (skin tone part) in Notion's 1200 frame: x 256..955, y 346..1053.
const HEAD = { x0: 256, x1: 955, y0: 346, y1: 1053 };
const CX = (HEAD.x0 + HEAD.x1) / 2;
const HW = HEAD.x1 - HEAD.x0;

/** Parts a photo never suggests: drawn jokes and props, picked by eye from the part sheets. */
const NOVELTY: Record<string, number[]> = {
  eyes: [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 36, 37, 38, 39, 40, 42, 43, 44, 46, 47, 48, 49, 50, 51, 52],
  brows: [1, 3, 4, 5, 6, 8, 10, 14, 15, 27, 33, 35, 37, 38, 39],
  nose: [9, 10, 24, 36, 41, 42, 44, 45, 46, 49, 50, 59, 60, 62, 67, 68],
  mouth: [3, 24, 39, 40, 44, 45, 46, 47, 48, 49, 50, 53, 56, 57, 59, 60],
  eyewear: [1, 10, 11, 12, 13, 15, 17],
  hair: [105, 106, 107, 113, 138, 139, 140, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 159, 235, 236, 237, 298, 299, 310, 311, 312, 313, 314, 315, 316, 317, 318, 325, 326, 327, 328, 329, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343],
  accessory: [],
  skintone: [],
};

type Mask = { w: number; h: number; ink: Float32Array };

/** Ink per pixel: alpha × darkness (the parts are black lines and grey fills on transparent). */
function inkOf(img: Rgba): { mask: Mask; alpha: Float32Array } {
  const n = img.width * img.height, ink = new Float32Array(n), alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = img.data[i * 4 + 3] / 255;
    alpha[i] = a;
    const lum = (0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2]) / 255;
    ink[i] = a * (1 - lum);
  }
  return { mask: { w: img.width, h: img.height, ink }, alpha };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

function bbox(alpha: Float32Array, w: number, h: number, x0 = 0, x1 = w) {
  let bx0 = w, by0 = h, bx1 = -1, by1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = x0; x < x1; x++)
      if (alpha[y * w + x] > 0.5) {
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
  return bx1 < 0 ? null : { x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1 };
}

/** Mirror overlap of the drawn pixels around the head's centre line (1 = symmetric). */
function symmetry(alpha: Float32Array, w: number, h: number) {
  let both = 0, any = 0;
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2) {
      const a = alpha[y * w + x] > 0.5, mx = Math.round(2 * CX - x);
      const b = mx >= 0 && mx < w && alpha[y * w + mx] > 0.5;
      if (a || b) any++;
      if (a && b) both++;
    }
  return any ? both / any : 1;
}

/** Number of separate drawn blobs (on a 4× smaller grid, ignoring specks). */
function blobs(alpha: Float32Array, w: number, h: number) {
  const s = 4, gw = Math.ceil(w / s), gh = Math.ceil(h / s), grid = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha[y * w + x] > 0.5) grid[Math.floor(y / s) * gw + Math.floor(x / s)] = 1;
  const seen = new Uint8Array(gw * gh);
  let count = 0;
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] || seen[i]) continue;
    let size = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!, x = j % gw, y = (j - x) / gw;
      size++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = ny * gw + nx;
        if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && grid[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    if (size >= 6) count++;
  }
  return count;
}

/**
 * A bun or top knot: going down from the top, the drawing narrows again (a
 * neck) before the hair widens. The deepest such narrowing in the top third,
 * relative to the width above it (0 = none, for a plain dome or a fringe).
 */
function bun(alpha: Float32Array, w: number, box: { x0: number; x1: number; y0: number; y1: number }) {
  let runMax = 0, best = 0;
  for (let y = box.y0; y < box.y0 + (box.y1 - box.y0) / 3; y++) {
    let x0 = -1, x1 = -1;
    for (let x = box.x0; x < box.x1; x++)
      if (alpha[y * w + x] > 0.5) {
        if (x0 < 0) x0 = x;
        x1 = x;
      }
    const width = x0 < 0 ? 0 : x1 - x0 + 1;
    runMax = Math.max(runMax, width);
    if (runMax >= 0.08 * HW) best = Math.max(best, (runMax - width) / runMax);
  }
  return best;
}

/**
 * Bumpiness of the hair's outer edge over the head: the farthest drawn pixel
 * along rays from the head's centre (upper half), minus its smoothed curve,
 * relative to the radius, in percent. Curls and afros score high, straight hair low.
 */
function curl(alpha: Float32Array, w: number, h: number) {
  const cx = CX, cy = 700, rays = 180, radii: number[] = [];
  for (let k = 0; k < rays; k++) {
    const t = Math.PI + (Math.PI * (k + 0.5)) / rays;
    const dx = Math.cos(t), dy = Math.sin(t);
    let far = 0;
    for (let r = 0; r < 700; r += 2) {
      const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r);
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      if (alpha[y * w + x] > 0.5) far = r;
    }
    radii.push(far);
  }
  const reached = radii.filter(Boolean), mean = reached.length ? reached.reduce((a, b) => a + b, 0) / reached.length : 0;
  if (!mean) return 0;
  // Only where the hair reaches (short hair leaves the sides bare), against neighbours that do too.
  let dev = 0, used = 0;
  for (let k = 0; k < rays; k++) {
    if (!radii[k]) continue;
    let sum = 0, n = 0;
    for (let j = Math.max(0, k - 7); j <= Math.min(rays - 1, k + 7); j++)
      if (radii[j]) {
        sum += radii[j];
        n++;
      }
    dev += Math.abs(radii[k] - sum / n);
    used++;
  }
  return used ? (100 * dev) / used / mean : 0;
}

/** Splits a pair (eyes, brows) at the widest empty column run near the middle; the viewer's left one. */
function leftOfPair(alpha: Float32Array, w: number, h: number, box: { x0: number; x1: number; y0: number; y1: number }) {
  const empty: boolean[] = [];
  for (let x = box.x0; x < box.x1; x++) {
    let any = false;
    for (let y = box.y0; y < box.y1 && !any; y++) any = alpha[y * w + x] > 0.5;
    empty.push(!any);
  }
  let best = -1, bestLen = 0;
  for (let i = 0; i < empty.length; ) {
    if (!empty[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < empty.length && empty[j]) j++;
    const mid = (i + j) / 2 / empty.length;
    if (mid > 0.25 && mid < 0.75 && j - i > bestLen) {
      best = i;
      bestLen = j - i;
    }
    i = j;
  }
  const cut = best >= 0 ? box.x0 + best : Math.floor(CX);
  return bbox(alpha, w, h, 0, cut) ?? box;
}

/** Top-most ink row per column of a box, NaN where the column is empty. */
function topProfile(alpha: Float32Array, w: number, b: { x0: number; x1: number; y0: number; y1: number }) {
  const out: number[] = [];
  for (let x = b.x0; x < b.x1; x++) {
    let top = NaN;
    for (let y = b.y0; y < b.y1; y++)
      if (alpha[y * w + x] > 0.5) {
        top = y;
        break;
      }
    out.push(top);
  }
  return out;
}
const meanOf = (v: number[]) => {
  const f = v.filter((x) => !Number.isNaN(x));
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN;
};
const slice = (v: number[], from: number, to: number) => v.slice(Math.floor(v.length * from), Math.max(Math.floor(v.length * from) + 1, Math.floor(v.length * to)));

function inkIn(mask: Mask, alpha: Float32Array, b: { x0: number; x1: number; y0: number; y1: number }) {
  let ink = 0, px = 0;
  for (let y = Math.max(0, b.y0); y < Math.min(mask.h, b.y1); y++)
    for (let x = Math.max(0, b.x0); x < Math.min(mask.w, b.x1); x++) {
      const i = y * mask.w + x;
      if (alpha[i] > 0.5) {
        px++;
        ink += mask.ink[i];
      }
    }
  return { px, ink };
}

type Desc = Record<string, number>;

function describe(key: string, img: Rgba): Desc | null {
  const { mask, alpha } = inkOf(img);
  const { w, h } = mask;
  const box = bbox(alpha, w, h);
  if (!box) return null;
  const all = inkIn(mask, alpha, box);
  const d: Desc = {
    w: r3((box.x1 - box.x0) / HW),
    h: r3((box.y1 - box.y0) / HW),
    area: r3(all.px / (HW * HW)),
    dark: r3(all.px ? all.ink / all.px : 0),
    sym: r3(symmetry(alpha, w, h)),
  };
  if (key === "eyes" || key === "brows") {
    // The left one (the viewer's left): its own box.
    const left = leftOfPair(alpha, w, h, box);
    const lw = left.x1 - left.x0, lh = left.y1 - left.y0, li = inkIn(mask, alpha, left);
    d.ew = r3(lw / HW);
    d.eh = r3(lh / HW);
    d.open = r3(lh / Math.max(1, lw));
    d.fill = r3(li.px / Math.max(1, lw * lh));
    d.gap = r3((2 * (CX - left.x1)) / HW);
    if (key === "brows") {
      const cols = topProfile(alpha, w, left).filter((v) => !Number.isNaN(v)).length;
      d.thick = r3(li.px / Math.max(1, cols) / HW);
      const prof = topProfile(alpha, w, left);
      const ends = (meanOf(slice(prof, 0, 0.15)) + meanOf(slice(prof, 0.85, 1))) / 2;
      d.arch = r3((ends - meanOf(slice(prof, 0.35, 0.65))) / Math.max(1, lw));
      // Inner end (towards the nose, right side of the left brow) higher → positive.
      d.tilt = r3((meanOf(slice(prof, 0, 0.2)) - meanOf(slice(prof, 0.8, 1))) / Math.max(1, lw));
    }
  }
  if (key === "mouth") {
    // The lips sit around y 880–940 in the frame; beards reach the jaw (y ≈ 1050).
    const lips = { x0: Math.round(CX - 140), x1: Math.round(CX + 140), y0: 850, y1: 960 };
    const above = inkIn(mask, alpha, { x0: lips.x0, x1: lips.x1, y0: 790, y1: 880 });
    let outside = 0;
    for (let y = box.y0; y < box.y1; y++)
      for (let x = box.x0; x < box.x1; x++) {
        const inLips = x >= lips.x0 && x < lips.x1 && y >= lips.y0 && y < lips.y1;
        if (!inLips && alpha[y * w + x] > 0.5) outside++;
      }
    d.beard = r3(outside / (HW * HW));
    d.stache = r3(above.px / (HW * HW));
    d.blobs = blobs(alpha, w, h);
    const lb = bbox(alpha, w, h) ?? box;
    const prof = topProfile(alpha, w, lb);
    const corners = (meanOf(slice(prof, 0, 0.15)) + meanOf(slice(prof, 0.85, 1))) / 2;
    // Corners higher than the middle → a smile (positive).
    d.smile = r3((meanOf(slice(prof, 0.4, 0.6)) - corners) / Math.max(1, lb.x1 - lb.x0));
    d.open = r3(d.h / Math.max(0.01, d.w));
  }
  if (key === "eyewear") {
    d.fill = r3(all.px / Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0)));
    d.blobs = blobs(alpha, w, h);
  }
  if (key === "hair") {
    d.top = r3((HEAD.y0 - box.y0) / HW);
    d.bottom = r3((box.y1 - HEAD.y1) / HW);
    d.side = r3((box.x1 - box.x0 - HW) / HW);
    d.bun = r3(bun(alpha, w, box));
    d.curl = r3(curl(alpha, w, h));
    // Sides of the face (temples to jaw) drawn over: long hair or a scarf framing the face.
    const sides = inkIn(mask, alpha, { x0: HEAD.x0 - 60, x1: HEAD.x0 + 90, y0: 650, y1: 1050 }).px + inkIn(mask, alpha, { x0: HEAD.x1 - 90, x1: HEAD.x1 + 60, y0: 650, y1: 1050 }).px;
    d.frame = r3(sides / (2 * 150 * 400));
  }
  if (key === "skintone") {
    // The fill's mean colour inside the head (the outline left out): the drawing's grey.
    let r = 0, g = 0, bl = 0, n = 0;
    for (let y = 450; y < 950; y += 2)
      for (let x = 350; x < 860; x += 2) {
        const i = (y * w + x) * 4;
        if (img.data[i + 3] < 250) continue;
        r += img.data[i];
        g += img.data[i + 1];
        bl += img.data[i + 2];
        n++;
      }
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(bl / n) };
  }
  return d;
}

async function main() {
  const out: Record<string, Record<number, Desc>> = {};
  for (const category of NOTION_CATEGORIES) {
    const table: Record<number, Desc> = {};
    for (const part of category.parts) {
      const img = decodePng(new Uint8Array(await readFile(join(CACHE, category.key, `${part.id}.png`))));
      const d = describe(category.key, img);
      if (!d) continue;
      if (NOVELTY[category.key]?.includes(part.id)) d.novelty = 1;
      table[part.id] = d;
    }
    out[category.key] = table;
    console.log(`${category.key}: ${Object.keys(table).length} parts`);
  }
  const lines = [
    "/**",
    " * Notion Faces part descriptors — GENERATED by scripts/notion-faces-descriptors.ts from the",
    " * 1200×1200 part PNGs; do not edit by hand. Lengths in head widths (700 px); see the script.",
    " * Derived from Notion Faces artwork (https://faces.notion.com), © Notion Labs, Inc.",
    " */",
    "",
    "export type NotionDescriptor = Record<string, number>;",
    "",
    "/** Per category key, per part id: the measures match.ts ranks parts by (novelty: 1 = never suggested). */",
    "export const NOTION_DESCRIPTORS: Record<string, Record<number, NotionDescriptor>> = {",
  ];
  for (const [key, table] of Object.entries(out)) {
    lines.push(`  ${key}: {`);
    for (const [id, d] of Object.entries(table)) lines.push(`    ${id}: ${JSON.stringify(d)},`);
    lines.push("  },");
  }
  lines.push("};", "");
  await writeFile(OUT, lines.join("\n"));
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
