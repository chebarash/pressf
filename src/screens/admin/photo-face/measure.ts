/**
 * Measures a face on a photo for "From a photo": skin and hair colour,
 * proportions, beard, glasses and hair shape, from MediaPipe's face landmarks
 * and blendshapes, a hair mask and the pixels. Pure (no DOM): the pixels come
 * in as RGBA, so the same code runs in tests. The result is only numbers;
 * nothing of the photo is kept.
 */
import { rgbToLab, type Lab, type PhotoFeatures, type Rgb } from "@/core/notion-faces/match";

export type Pixels = { width: number; height: number; data: Uint8ClampedArray | Uint8Array };
/** Landmarks in pixels (MediaPipe Face Mesh order, 478 points). */
export type Point = { x: number; y: number };
/** Non-zero = hair, per pixel of a grid laid over the image (any size). */
export type HairMask = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };
export type Blendshapes = Record<string, number>;
/** Optional: the pixel indices of each sampled region, for drawing them while tuning. */
export type Debug = Record<string, number[]>;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const quantile = (v: number[], q: number) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};
const median = (v: number[]) => quantile(v, 0.5);

/** The photo's pixels as CIELAB, computed once. */
export class LabImage {
  readonly width: number;
  readonly height: number;
  readonly L: Float32Array;
  readonly a: Float32Array;
  readonly b: Float32Array;
  constructor(private px: Pixels) {
    this.width = px.width;
    this.height = px.height;
    const n = px.width * px.height;
    this.L = new Float32Array(n);
    this.a = new Float32Array(n);
    this.b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [L, a, b] = rgbToLab([px.data[i * 4], px.data[i * 4 + 1], px.data[i * 4 + 2]]);
      this.L[i] = L;
      this.a[i] = a;
      this.b[i] = b;
    }
  }
  index(p: Point) {
    const x = Math.round(p.x), y = Math.round(p.y);
    return x < 0 || y < 0 || x >= this.width || y >= this.height ? -1 : y * this.width + x;
  }
  rgb(i: number): Rgb {
    return [this.px.data[i * 4], this.px.data[i * 4 + 1], this.px.data[i * 4 + 2]];
  }
}

/** Pixel indices inside a convex polygon, every `step` px. */
function polygon(img: LabImage, poly: Point[], step = 1): number[] {
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const inside = (x: number, y: number) => {
    let sign = 0;
    for (let k = 0; k < poly.length; k++) {
      const p0 = poly[k], p1 = poly[(k + 1) % poly.length];
      const cross = (p1.x - p0.x) * (y - p0.y) - (p1.y - p0.y) * (x - p0.x);
      if (cross === 0) continue;
      const s = Math.sign(cross);
      if (sign && s !== sign) return false;
      sign = s;
    }
    return true;
  };
  const out: number[] = [];
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y += step)
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x += step) {
      if (!inside(x, y)) continue;
      const i = img.index({ x, y });
      if (i >= 0) out.push(i);
    }
  return out;
}

/** An axis-aligned rectangle of pixel indices. */
function rect(img: LabImage, x0: number, y0: number, x1: number, y1: number, step = 1): number[] {
  const out: number[] = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y += step)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += step) {
      const i = img.index({ x, y });
      if (i >= 0) out.push(i);
    }
  return out;
}
const around = (img: LabImage, c: Point, half: number, step = 1) => rect(img, c.x - half, c.y - half, c.x + half, c.y + half, step);

/**
 * The strongest straight horizontal edge in a box: per row, the mean vertical
 * change of L* across the box; the best row. A glasses rim or bridge is a
 * line across the whole box; skin texture averages out.
 */
function rowEdge(img: LabImage, x0: number, y0: number, x1: number, y1: number) {
  const w = img.width;
  let best = 0;
  for (let y = Math.round(Math.min(y0, y1)); y <= Math.round(Math.max(y0, y1)); y++) {
    if (y < 1 || y >= img.height - 1) continue;
    let sum = 0, n = 0;
    for (let x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x++) {
      if (x < 0 || x >= w) continue;
      const i = y * w + x;
      sum += Math.abs(img.L[i + w] - img.L[i - w]) / 2;
      n++;
    }
    if (n) best = Math.max(best, sum / n);
  }
  return best;
}

// Face Mesh landmark ids.
const LM = {
  cheekR: 234, cheekL: 454, forehead: 10, chin: 152, bridge: 168, subnasale: 2,
  eyeR: { outer: 33, inner: 133, top: 159, bottom: 145 },
  eyeL: { outer: 263, inner: 362, top: 386, bottom: 374 },
  browR: { upper: [70, 63, 105, 66, 107], lower: [46, 53, 52, 65, 55] },
  browL: { upper: [300, 293, 334, 296, 336], lower: [276, 283, 282, 295, 285] },
  alarR: 129, alarL: 358,
  mouthR: 61, mouthL: 291, lipTop: 0, lipBottom: 17, innerTop: 13, innerBottom: 14,
  jawR: [172, 136, 150, 149], jawL: [397, 365, 379, 378],
  cheekPatchR: [117, 118, 50, 101], cheekPatchL: [346, 347, 280, 330],
  foreheadPatch: [109, 10, 338, 151, 9],
};

export type MeasureInput = { pixels: Pixels; landmarks: Point[]; blendshapes: Blendshapes; hair: HairMask | null; debug?: Debug };

export function measureFace({ pixels, landmarks: P, blendshapes: bs, hair, debug }: MeasureInput): PhotoFeatures {
  const img = new LabImage(pixels);
  const W = dist(P[LM.cheekR], P[LM.cheekL]);
  const unit = Math.max(1, Math.round(W / 120)); // a sampling step that scales with the face
  const note = (name: string, idx: number[]) => {
    if (debug) debug[name] = idx;
    return idx;
  };

  /* skin: cheeks and forehead, the middle of their lightness (shadows, shine and pores out) */
  const skinIdx = note("skin", [...LM.cheekPatchR, ...LM.cheekPatchL, ...LM.foreheadPatch].flatMap((id) => around(img, P[id], W * 0.03, unit)));
  const byL = skinIdx.filter((i) => img.L[i] > 8).sort((x, y) => img.L[x] - img.L[y]);
  const mid = byL.slice(Math.floor(byL.length * 0.3), Math.ceil(byL.length * 0.7));
  const skinRgb: Rgb = [0, 1, 2].map((k) => median(mid.map((i) => img.rgb(i)[k]))) as Rgb;
  const skin: Lab = rgbToLab(skinRgb);
  const skinChroma = Math.hypot(skin[1], skin[2]);
  /**
   * Skin under any light: the skin's colour, lighter or darker, with its
   * colourfulness scaled to the lightness (a shadow on skin keeps the hue).
   * Hair (greyer, or far darker) is not.
   */
  const isSkin = (i: number) => {
    const L = img.L[i];
    if (L < skin[0] - 40 || L > skin[0] + 22) return false;
    const r = Math.max(0.45, Math.min(1.2, L / Math.max(1, skin[0])));
    return Math.hypot(img.a[i] - skin[1] * r, img.b[i] - skin[2] * r) < 7 + skinChroma * 0.2;
  };

  /* eyes */
  const ear = (e: typeof LM.eyeR) => dist(P[e.top], P[e.bottom]) / Math.max(1, dist(P[e.outer], P[e.inner]));
  const blink = ((bs.eyeBlinkLeft ?? 0) + (bs.eyeBlinkRight ?? 0)) / 2;
  const open = (ear(LM.eyeR) + ear(LM.eyeL)) / 2 - blink * 0.05;
  const eyeWidth = (dist(P[LM.eyeR.outer], P[LM.eyeR.inner]) + dist(P[LM.eyeL.outer], P[LM.eyeL.inner])) / 2 / W;

  /* brows: shape from landmarks, thickness from the dark band across them */
  const browShape = (upper: number[]) => {
    const outer = P[upper[0]], inner = P[upper[4]], middle = P[upper[2]];
    const len = Math.max(1, dist(outer, inner));
    const line = mix(outer, inner, 0.5);
    return { arch: (line.y - middle.y) / len, tilt: (outer.y - inner.y) / len };
  };
  const browThick = (upper: number[], lower: number[]) => {
    const runs: number[] = [];
    for (let k = 1; k < 5; k++) {
      const c = mix(P[upper[k]], P[lower[k]], 0.5);
      let run = 0;
      for (let y = c.y - W * 0.06; y <= c.y + W * 0.05; y++) {
        const i = img.index({ x: c.x, y });
        if (i >= 0 && !isSkin(i) && img.L[i] < skin[0] - 8) run++;
      }
      runs.push(run);
    }
    return median(runs) / W;
  };
  const sR = browShape(LM.browR.upper), sL = browShape(LM.browL.upper);
  const brows = {
    thick: (browThick(LM.browR.upper, LM.browR.lower) + browThick(LM.browL.upper, LM.browL.lower)) / 2,
    arch: (sR.arch + sL.arch) / 2,
    tilt: (sR.tilt + sL.tilt) / 2,
  };

  /* nose and mouth */
  const nose = { width: dist(P[LM.alarR], P[LM.alarL]) / W, length: dist(P[LM.bridge], P[LM.subnasale]) / W };
  const mouth = {
    width: dist(P[LM.mouthR], P[LM.mouthL]) / W,
    smile: ((bs.mouthSmileLeft ?? 0) + (bs.mouthSmileRight ?? 0)) / 2,
    open: dist(P[LM.innerTop], P[LM.innerBottom]) / W,
  };

  /* beard: the share of each region that isn't skin (darker or greyer than it), and how much only mildly */
  const hairy = (idx: number[]) => {
    let n = 0, mild = 0;
    for (const i of idx) {
      if (isSkin(i) || img.a[i] > skin[1] + 4) continue; // skin, or redder than it (lips, lipstick)
      const darker = img.L[i] < skin[0] - 6, greyer = Math.hypot(img.a[i], img.b[i]) < skinChroma - 8;
      if (!darker && !greyer) continue;
      n++;
      if (img.L[i] > skin[0] - 22) mild++;
    }
    return { share: idx.length ? n / idx.length : 0, mild: n ? mild / n : 0 };
  };
  const mR = P[LM.mouthR], mL = P[LM.mouthL], lipB = P[LM.lipBottom], ch = P[LM.chin];
  // The chin under the lower lip, clear of the lips (open smiles) and of the jaw's shadow.
  const chinTop = lipB.y + (ch.y - lipB.y) * 0.35, chinBottom = ch.y - (ch.y - lipB.y) * 0.15, chinHalf = dist(mR, mL) * 0.3;
  const chinIdx = note("chin", rect(img, ch.x - chinHalf, chinTop, ch.x + chinHalf, chinBottom, unit));
  const jawIdx = note("jaw", [...LM.jawR.map((id) => around(img, mix(P[id], mR, 0.4), W * 0.03, unit)), ...LM.jawL.map((id) => around(img, mix(P[id], mL, 0.4), W * 0.03, unit))].flat());
  const sub = P[LM.subnasale], lipT = P[LM.lipTop];
  const stacheIdx = note("stache", polygon(img, [mix(mix(sub, lipT, 0.25), mR, 0.4), mix(mix(sub, lipT, 0.25), mL, 0.4), mix(mix(sub, lipT, 0.65), mL, 0.4), mix(mix(sub, lipT, 0.65), mR, 0.4)], unit));
  const chin = hairy(chinIdx), jaw = hairy(jawIdx), stache = hairy(stacheIdx);
  const beard = { chin: chin.share, jaw: jaw.share, stache: stache.share, patchy: (chin.mild + jaw.mild) / 2 };

  /* glasses: straight edges over the bridge, under the eyes and at the temples, against the cheeks */
  const eyeBox = (e: typeof LM.eyeR) => {
    const o = P[e.outer], i = P[e.inner], h = Math.max(dist(P[e.top], P[e.bottom]), W * 0.03);
    return { x0: Math.min(o.x, i.x), x1: Math.max(o.x, i.x), y: (o.y + i.y) / 2, h };
  };
  const eR = eyeBox(LM.eyeR), eL = eyeBox(LM.eyeL);
  const cheekBase = Math.max(0.6, (rowEdge(img, eR.x0, eR.y + W * 0.2, eR.x1, eR.y + W * 0.26) + rowEdge(img, eL.x0, eL.y + W * 0.2, eL.x1, eL.y + W * 0.26)) / 2);
  const bridgeX = P[LM.bridge].x, bridgeY0 = Math.min(P[LM.browR.lower[4]].y, P[LM.browL.lower[4]].y), bridgeY1 = (eR.y + eL.y) / 2;
  const bridge = rowEdge(img, bridgeX - W * 0.04, bridgeY0, bridgeX + W * 0.04, bridgeY1);
  const under = (e: typeof eR) => rowEdge(img, e.x0 + (e.x1 - e.x0) * 0.2, e.y + e.h * 1.2, e.x1 - (e.x1 - e.x0) * 0.2, e.y + e.h * 1.2 + W * 0.14);
  const rims = (under(eR) + under(eL)) / 2;
  // The arms: from the outer corner of each eye towards the ear, around the eye's height.
  const armR = rowEdge(img, P[LM.cheekR].x + W * 0.03, eR.y - W * 0.06, P[LM.eyeR.outer].x - W * 0.04, eR.y + W * 0.02);
  const armL = rowEdge(img, P[LM.eyeL.outer].x + W * 0.04, eL.y - W * 0.06, P[LM.cheekL].x - W * 0.03, eL.y + W * 0.02);
  const arms = (armR + armL) / 2;
  note("glasses", [
    ...rect(img, bridgeX - W * 0.04, bridgeY0, bridgeX + W * 0.04, bridgeY1, 2),
    ...rect(img, eR.x0 + (eR.x1 - eR.x0) * 0.2, eR.y + eR.h * 1.2, eR.x1 - (eR.x1 - eR.x0) * 0.2, eR.y + eR.h * 1.2 + W * 0.14, 2),
    ...rect(img, eL.x0 + (eL.x1 - eL.x0) * 0.2, eL.y + eL.h * 1.2, eL.x1 - (eL.x1 - eL.x0) * 0.2, eL.y + eL.h * 1.2 + W * 0.14, 2),
  ]);
  note("arms", [...rect(img, P[LM.cheekR].x + W * 0.03, eR.y - W * 0.06, P[LM.eyeR.outer].x - W * 0.04, eR.y + W * 0.02, 2), ...rect(img, P[LM.eyeL.outer].x + W * 0.04, eL.y - W * 0.06, P[LM.cheekL].x - W * 0.03, eL.y + W * 0.02, 2)]);
  // Glasses show on at least two of the three: the second-strongest cue against its threshold.
  const cues = [bridge / cheekBase / 2.5, rims / cheekBase / 2.2, arms / cheekBase / 1.8].sort((a, b) => b - a);
  const lift = 0.5 + (cues[1] - 1) / 0.4;
  // Dark lenses: even the brightest part of the eye opening (the white of the eye) is dark.
  const eyeIdx = [LM.eyeR, LM.eyeL].flatMap((e) => polygon(img, [P[e.outer], P[e.top], P[e.inner], P[e.bottom]], 1));
  const eyeBright = quantile(eyeIdx.map((i) => img.L[i]), 0.85);
  const glasses = { score: clamp01(lift), dark: clamp01((skin[0] - eyeBright - 35) / 20), frame: cues[0] };

  /* hair */
  const hairFeat = measureHair(img, P, W, isSkin, hair, note);

  return { skin: skinRgb, eyes: { open, width: eyeWidth }, brows, nose, mouth, beard, glasses, hair: hairFeat };
}

function measureHair(img: LabImage, P: Point[], W: number, isSkin: (i: number) => boolean, hair: HairMask | null, note: (name: string, idx: number[]) => number[]): PhotoFeatures["hair"] {
  const top = P[LM.forehead], chin = P[LM.chin], left = P[LM.cheekR], right = P[LM.cheekL];
  const maskAt = (i: number) => {
    if (!hair) return false;
    const x = i % img.width, y = (i - x) / img.width;
    const mx = Math.floor((x * hair.width) / img.width), my = Math.floor((y * hair.height) / img.height);
    return hair.data[my * hair.width + mx] > 0;
  };
  const step = Math.max(1, Math.round(W / 80));
  // The scalp: a band above the forehead landmark, across the face.
  const scalp = note("scalp", rect(img, left.x + W * 0.2, top.y - W * 0.3, right.x - W * 0.2, top.y - W * 0.06, step));
  // The ears (beside the cheeks, eyes to mouth) and the neck under the chin: a scarf covers them.
  const eyeY = (P[LM.eyeR.outer].y + P[LM.eyeL.outer].y) / 2, mouthY = (P[LM.mouthR].y + P[LM.mouthL].y) / 2;
  const ears = note("ears", [...rect(img, left.x - W * 0.1, eyeY, left.x - W * 0.01, mouthY, step), ...rect(img, right.x + W * 0.01, eyeY, right.x + W * 0.1, mouthY, step)]);
  const neck = note("neck", rect(img, chin.x - W * 0.15, chin.y + W * 0.12, chin.x + W * 0.15, chin.y + W * 0.3, step));
  const share = (idx: number[], test: (i: number) => boolean) => (idx.length ? idx.filter(test).length / idx.length : 0);

  const scalpHair = share(scalp, maskAt), scalpSkin = share(scalp, (i) => !maskAt(i) && isSkin(i));
  const earsCovered = share(ears, (i) => !isSkin(i)), neckCovered = share(neck, (i) => !isSkin(i));
  // Beside the jaw, either side of the chin: no skin at all where a scarf wraps under the face.
  const jawLine = note("underjaw", [...rect(img, chin.x - W * 0.42, chin.y - W * 0.05, chin.x - W * 0.2, chin.y + W * 0.1, step), ...rect(img, chin.x + W * 0.2, chin.y - W * 0.05, chin.x + W * 0.42, chin.y + W * 0.1, step)]);
  const underJawSkin = share(jawLine, isSkin);
  // Wrapped (a hijab, a scarf): neck, ears and the jaw's sides hidden; covered: also no scalp showing.
  // (The hair segmenter often calls a scarf hair, so this reads skin, not the mask.)
  const frame = clamp01((neckCovered - 0.7) / 0.2) * clamp01((0.2 - underJawSkin) / 0.1) * clamp01((earsCovered - 0.35) / 0.2);
  const covered = frame * clamp01((0.35 - scalpSkin) / 0.15);

  // Hair extents from the mask (only hair near the head).
  let minY = Infinity, minX = Infinity, maxX = -Infinity, lowY = -Infinity;
  const colourIdx: number[] = [];
  if (hair) {
    const sx = img.width / hair.width, sy = img.height / hair.height;
    for (let my = 0; my < hair.height; my++)
      for (let mx = 0; mx < hair.width; mx++) {
        if (!hair.data[my * hair.width + mx]) continue;
        const x = (mx + 0.5) * sx, y = (my + 0.5) * sy;
        if (Math.abs(x - (left.x + right.x) / 2) > W * 1.1 || y < top.y - W * 0.9 || y > chin.y + W * 1.5) continue;
        if (Math.abs(x - top.x) < W * 0.3) minY = Math.min(minY, y);
        if (y < chin.y) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
        // Long hair: beside or below the jaw, outside the cheeks' columns (not a beard).
        if (x < left.x + W * 0.05 || x > right.x - W * 0.05) lowY = Math.max(lowY, y);
        // The colour: the hair above the eyes (no beard, no shoulders).
        if (y < eyeY && (mx + my) % 2 === 0) {
          const i = img.index({ x, y });
          if (i >= 0) colourIdx.push(i);
        }
      }
  }
  const colour: Rgb = colourIdx.length ? ([0, 1, 2].map((k) => median(colourIdx.map((i) => img.rgb(i)[k]))) as Rgb) : [40, 30, 25];

  return {
    cover: scalpHair,
    top: Number.isFinite(minY) ? (top.y - minY) / W : 0,
    bottom: Number.isFinite(lowY) ? (lowY - chin.y) / W : -1,
    side: Number.isFinite(minX) ? (maxX - minX - W) / W : -0.3,
    curl: hair ? maskCurl(hair, img, { x: top.x, y: (top.y + chin.y) / 2 }, W) : 0,
    bun: hair ? maskBun(hair, img, top, W) : 0,
    colour,
    covered,
    frame,
  };
}

/** The hair mask's outer edge over the head, as rays from the face centre: bumpiness in percent of the radius. */
function maskCurl(hair: HairMask, img: LabImage, c: Point, W: number) {
  const sx = hair.width / img.width, sy = hair.height / img.height;
  const rays = 120, radii: number[] = [];
  for (let k = 0; k < rays; k++) {
    const t = Math.PI + (Math.PI * (k + 0.5)) / rays;
    let far = 0;
    for (let r = 0; r < W * 1.4; r += 1) {
      const x = Math.floor((c.x + Math.cos(t) * r) * sx), y = Math.floor((c.y + Math.sin(t) * r) * sy);
      if (x < 0 || y < 0 || x >= hair.width || y >= hair.height) break;
      if (hair.data[y * hair.width + x]) far = r;
    }
    radii.push(far);
  }
  const reached = radii.filter(Boolean);
  if (reached.length < rays / 4) return 0;
  const mean = reached.reduce((a, b) => a + b, 0) / reached.length;
  let dev = 0, used = 0;
  for (let k = 0; k < rays; k++) {
    if (!radii[k]) continue;
    let sum = 0, n = 0;
    for (let j = Math.max(0, k - 5); j <= Math.min(rays - 1, k + 5); j++)
      if (radii[j]) {
        sum += radii[j];
        n++;
      }
    dev += Math.abs(radii[k] - sum / n);
    used++;
  }
  return (100 * dev) / used / mean;
}

/** A bun: from the top of the hair down, the mask narrows again before it widens (as in the descriptors). */
function maskBun(hair: HairMask, img: LabImage, top: Point, W: number) {
  const sx = hair.width / img.width, sy = hair.height / img.height;
  const x0 = Math.max(0, Math.round((top.x - W * 0.9) * sx)), x1 = Math.min(hair.width, Math.round((top.x + W * 0.9) * sx));
  let first = -1;
  for (let y = 0; y < hair.height && first < 0; y++)
    for (let x = x0; x < x1; x++)
      if (hair.data[y * hair.width + x]) {
        first = y;
        break;
      }
  if (first < 0) return 0;
  const end = Math.min(hair.height, Math.round(top.y * sy));
  let runMax = 0, best = 0;
  for (let y = first; y < first + (end - first) / 2; y++) {
    let a = -1, b = -1;
    for (let x = x0; x < x1; x++)
      if (hair.data[y * hair.width + x]) {
        if (a < 0) a = x;
        b = x;
      }
    const width = a < 0 ? 0 : b - a + 1;
    runMax = Math.max(runMax, width);
    if (runMax >= W * 0.15 * sx) best = Math.max(best, (runMax - width) / runMax);
  }
  // As a 0–1 score: a clear neck (a third narrower) is a bun.
  return Math.min(1, best / 0.35);
}
