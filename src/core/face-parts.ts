/**
 * The face constructor: a professor's drawn face assembled from layered parts,
 * in the Press F / Notion-Faces line style (one confident ink weight with a
 * slight brush taper, white head with a dotted tone, flat hair shapes).
 *
 * Every part is placed on anchors measured from the chosen head shape (crown,
 * hairline, eye line, nose tip, mouth line, jaw, ear line), so any
 * combination fits: hair hugs the skull, beards follow the jaw, glasses sit on
 * the bridge and reach the head's edge, hats sit on the crown. Layers, back to
 * front: back hair → ears → head → details → beard → nose, mouth → eyes,
 * brows → front hair → glasses → accessories.
 *
 * A FaceSpec is plain JSON; `renderFace` turns it into the same SVG every time,
 * so a saved face can be reopened and edited. Older saved specs still load:
 * renamed options are mapped (`migrateFaceSpec`) and new parts take defaults.
 *
 * Square 480×480 viewBox, transparent background, no scripts, links or images:
 * the output passes `checkFace`. In dark mode the app draws a thin white
 * outline around the head (Face.module.css); nothing here depends on the theme.
 * All artwork here is original, authored as code.
 */
import { z } from "zod";

export const FACE_PARTS = {
  head: ["oval", "round", "long", "square", "heart", "pear", "wide"],
  ears: ["normal", "small", "big"],
  tone: ["dots", "light", "dense", "none"],
  hair: ["none", "receding", "buzz", "crew", "short", "sidePart", "quiff", "slick", "spiky", "messy", "curly", "afro", "wavy", "bob", "bangs", "long", "longWavy", "ponytail", "bun", "braid", "hijab", "headscarf", "wrap"],
  hairColor: ["black", "grey", "white"],
  facialHair: ["none", "stubble", "moustache", "handlebar", "walrus", "goatee", "soulPatch", "chinStrap", "beardShort", "beardFull", "beardLong"],
  brows: ["straight", "arched", "thick", "raised", "angry", "worried", "bushy", "thin", "none"],
  eyes: ["dot", "open", "lidded", "happy", "closed", "wide", "small", "wink", "lashes", "tired", "side"],
  glasses: ["none", "round", "rect", "browline", "aviator", "cateye", "reading", "sunglasses"],
  nose: ["line", "long", "button", "small", "wide", "pointy", "angular", "round"],
  mouth: ["neutral", "smile", "grin", "small", "smirk", "open", "frown", "teeth", "flat", "bigSmile", "pout"],
  headwear: ["none", "doppi", "cap", "beanie", "grad", "earrings", "hoops", "headphones", "pencil"],
  details: ["none", "freckles", "blush", "mole", "wrinkles", "ageLines", "eyeBags", "dimples"],
} as const;

export type FacePart = keyof typeof FACE_PARTS;
export type FaceSpec = { [K in FacePart]: (typeof FACE_PARTS)[K][number] };

/** The parts "From a photo" picks; tone, hair colour and details stay the admin's choice. */
export type PhotoFaceSpec = Omit<FaceSpec, "tone" | "hairColor" | "details">;

export const FACE_PART_ORDER = Object.keys(FACE_PARTS) as FacePart[];

export const FACE_PART_LABELS: Record<FacePart, string> = {
  head: "Face shape",
  ears: "Ears",
  tone: "Skin tone dots",
  hair: "Hair",
  hairColor: "Hair colour",
  facialHair: "Beard",
  brows: "Eyebrows",
  eyes: "Eyes",
  glasses: "Glasses",
  nose: "Nose",
  mouth: "Mouth",
  headwear: "Accessories",
  details: "Details",
};

export const FACE_OPTION_LABELS: { [K in FacePart]: Record<FaceSpec[K], string> } = {
  head: { oval: "Oval", round: "Round", long: "Long", square: "Square", heart: "Heart", pear: "Wide jaw", wide: "Wide" },
  ears: { normal: "Normal", small: "Small", big: "Big" },
  tone: { dots: "Dots", light: "Light", dense: "Dense", none: "None" },
  hair: {
    none: "Bald", receding: "Receding", buzz: "Buzz", crew: "Crew cut", short: "Short", sidePart: "Side part", quiff: "Quiff", slick: "Slicked back", spiky: "Spiky", messy: "Messy",
    curly: "Curly", afro: "Afro", wavy: "Wavy", bob: "Bob", bangs: "Bangs", long: "Long", longWavy: "Long wavy", ponytail: "Ponytail", bun: "Bun", braid: "Braid",
    hijab: "Hijab", headscarf: "Headscarf", wrap: "Head wrap",
  },
  hairColor: { black: "Black", grey: "Grey", white: "White" },
  facialHair: { none: "None", stubble: "Stubble", moustache: "Moustache", handlebar: "Handlebar", walrus: "Walrus", goatee: "Goatee", soulPatch: "Soul patch", chinStrap: "Chin strap", beardShort: "Short beard", beardFull: "Full beard", beardLong: "Long beard" },
  brows: { straight: "Straight", arched: "Arched", thick: "Thick", raised: "Raised", angry: "Frown", worried: "Worried", bushy: "Bushy", thin: "Thin", none: "None" },
  eyes: { dot: "Dots", open: "Open", lidded: "Lidded", happy: "Happy", closed: "Closed", wide: "Wide", small: "Small", wink: "Wink", lashes: "Lashes", tired: "Tired", side: "Side glance" },
  glasses: { none: "None", round: "Round", rect: "Rectangular", browline: "Browline", aviator: "Aviator", cateye: "Cat-eye", reading: "Reading", sunglasses: "Sunglasses" },
  nose: { line: "Line", long: "Long", button: "Button", small: "Small", wide: "Wide", pointy: "Pointy", angular: "Angular", round: "Round" },
  mouth: { neutral: "Neutral", smile: "Smile", grin: "Laugh", small: "Small", smirk: "Smirk", open: "Surprised", frown: "Frown", teeth: "Toothy", flat: "Flat", bigSmile: "Big smile", pout: "Pout" },
  headwear: { none: "None", doppi: "Doppi", cap: "Cap", beanie: "Beanie", grad: "Graduation cap", earrings: "Earrings", hoops: "Hoops", headphones: "Headphones", pencil: "Pencil" },
  details: { none: "None", freckles: "Freckles", blush: "Blush", mole: "Mole", wrinkles: "Forehead lines", ageLines: "Age lines", eyeBags: "Eye bags", dimples: "Dimples" },
};

export const FaceSpecSchema = z.object({
  head: z.enum(FACE_PARTS.head),
  ears: z.enum(FACE_PARTS.ears),
  tone: z.enum(FACE_PARTS.tone),
  hair: z.enum(FACE_PARTS.hair),
  hairColor: z.enum(FACE_PARTS.hairColor),
  facialHair: z.enum(FACE_PARTS.facialHair),
  brows: z.enum(FACE_PARTS.brows),
  eyes: z.enum(FACE_PARTS.eyes),
  glasses: z.enum(FACE_PARTS.glasses),
  nose: z.enum(FACE_PARTS.nose),
  mouth: z.enum(FACE_PARTS.mouth),
  headwear: z.enum(FACE_PARTS.headwear),
  details: z.enum(FACE_PARTS.details),
});

export const DEFAULT_FACE_SPEC: FaceSpec = {
  head: "oval",
  ears: "normal",
  tone: "dots",
  hair: "short",
  hairColor: "black",
  facialHair: "none",
  brows: "straight",
  eyes: "dot",
  glasses: "none",
  nose: "line",
  mouth: "neutral",
  headwear: "none",
  details: "none",
};

/** Options renamed since the first constructor (PR #123): old id → new id. */
export const LEGACY_OPTIONS: Partial<{ [K in FacePart]: Record<string, FaceSpec[K]> }> = {
  hair: { side: "sidePart" },
  eyes: { dots: "dot", almond: "open" },
  nose: { hook: "long" },
};

/** Parts added after the first constructor: a spec saved without them takes these. */
const ADDED_PARTS: Partial<FaceSpec> = { hairColor: "black", details: "none" };

/** Renamed options to their new ids and missing new parts filled in; anything else is left for the schema to judge. */
export function migrateFaceSpec(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = { ...ADDED_PARTS, ...(value as Record<string, unknown>) };
  for (const [part, map] of Object.entries(LEGACY_OPTIONS) as [string, Record<string, string>][]) {
    const v = out[part];
    if (typeof v === "string" && Object.hasOwn(map, v)) out[part] = map[v];
  }
  return out;
}

/** A stored spec (JSON column) back to a FaceSpec; unknown or missing parts fall back to the default. */
export function parseFaceSpec(value: unknown): FaceSpec | null {
  if (!value || typeof value !== "object") return null;
  const migrated = migrateFaceSpec(value) as Record<string, unknown>;
  const out = { ...DEFAULT_FACE_SPEC } as Record<FacePart, string>;
  for (const part of FACE_PART_ORDER) {
    const v = migrated[part];
    if (typeof v === "string" && (FACE_PARTS[part] as readonly string[]).includes(v)) out[part] = v;
  }
  return out as FaceSpec;
}

const COVERED = new Set<FaceSpec["hair"]>(["hijab", "headscarf", "wrap"]);
const LONG = new Set<FaceSpec["hair"]>(["long", "longWavy", "bob", "bangs", "bun", "ponytail", "braid", "hijab", "headscarf", "wrap", "wavy"]);

/** A random face from a seeded generator (`random` returns [0, 1)). Rare parts come up less often. */
export function randomFaceSpec(random: () => number = Math.random): FaceSpec {
  const pick = <T>(xs: readonly T[]) => xs[Math.min(xs.length - 1, Math.floor(random() * xs.length))];
  const spec = Object.fromEntries(FACE_PART_ORDER.map((p) => [p, pick(FACE_PARTS[p])])) as FaceSpec;
  // Keep randomize believable: hats, glasses, details and grey hair are the exception.
  if (random() < 0.7) spec.headwear = "none";
  if (random() < 0.4) spec.glasses = "none";
  if (random() < 0.6) spec.details = "none";
  if (random() < 0.6) spec.hairColor = "black";
  if (LONG.has(spec.hair)) {
    if (random() < 0.85) spec.facialHair = "none";
    if (COVERED.has(spec.hair) && spec.headwear !== "earrings" && spec.headwear !== "hoops") spec.headwear = "none";
  } else if (random() < 0.4) spec.facialHair = "none";
  if (spec.tone === "none" && random() < 0.6) spec.tone = "dots";
  return spec;
}

/* ───────── geometry ───────── */

const SIZE = 480;
const CX = 240;
const CY = 250;
const INK = "#111111";
const PAPER = "#ffffff";
/** The one ink weight: head outline, hair edges, frames. Features are brushed at about the same weight. */
const OUTLINE = 8.5;
const LINE = 8;

type Pt = [number, number];
type Shape = { rx: number; ryT: number; ryB: number; taper: number; p: number; sq: number };

const HEADS: Record<FaceSpec["head"], Shape> = {
  oval: { rx: 128, ryT: 150, ryB: 168, taper: 0.22, p: 2, sq: 2 },
  round: { rx: 140, ryT: 146, ryB: 150, taper: 0.08, p: 2, sq: 2 },
  long: { rx: 116, ryT: 156, ryB: 182, taper: 0.18, p: 2, sq: 2 },
  square: { rx: 134, ryT: 148, ryB: 160, taper: 0.16, p: 4, sq: 2.8 },
  heart: { rx: 138, ryT: 148, ryB: 168, taper: 0.42, p: 1.4, sq: 2 },
  pear: { rx: 126, ryT: 140, ryB: 166, taper: -0.06, p: 2, sq: 2.6 },
  wide: { rx: 152, ryT: 140, ryB: 150, taper: 0.14, p: 2, sq: 2.2 },
};

const n = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};
const pt = ([x, y]: Pt) => `${n(x)} ${n(y)}`;
const PI = Math.PI;

/** A small fixed wobble along the head outline: the hand-drawn feel, the same every time. */
const wobble = (a: number) => 1.3 * Math.sin(3 * a + 0.4) + 0.7 * Math.sin(7 * a + 1.3);

/** A point on the head outline at angle `a` (0 = right, π/2 = chin, 3π/2 = crown), pushed out by `d`. */
function headPoint(h: Shape, a: number, d = 0): Pt {
  const s = Math.sin(a);
  const c = Math.cos(a);
  d += wobble(a);
  if (s < 0) return [CX + (h.rx + d) * c, CY + (h.ryT + d) * s];
  const e = 2 / h.sq;
  const k = 1 - h.taper * Math.pow(s, h.p);
  return [CX + (h.rx + d) * Math.sign(c) * Math.pow(Math.abs(c), e) * k, CY + (h.ryB + d) * Math.pow(s, e)];
}

function arc(h: Shape, from: number, to: number, d: number | ((a: number) => number), steps = 16): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    out.push(headPoint(h, a, typeof d === "number" ? d : d(a)));
  }
  return out;
}

/** Catmull-Rom through the points as cubic Béziers, starting from the current point (= pts[0]). */
function through(pts: Pt[], closed = false): string {
  let out = "";
  const count = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < count; i++) {
    const p0 = pts[closed ? (i - 1 + pts.length) % pts.length : Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[closed ? (i + 2) % pts.length : Math.min(pts.length - 1, i + 2)];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    out += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return out;
}
const smoothClosed = (pts: Pt[]) => `M${pt(pts[0])}${through(pts, true)}Z`;
const smoothOpen = (pts: Pt[]) => `M${pt(pts[0])}${through(pts)}`;
/** Several open runs joined by straight segments, closed: corners where runs meet. */
const runs = (...parts: Pt[][]) => parts.map((r, i) => `${i ? "L" : "M"}${pt(r[0])}${through(r)}`).join("") + "Z";
/** Scalloped run (curls, tufts) through the points: each step is a little arc bulging outward. */
const scallop = (pts: Pt[], bulge = 0.62, sweep = 1) => pts.slice(1).map((p, i) => {
  const r = Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]) * bulge;
  return `A${n(r)} ${n(r)} 0 0 ${sweep} ${pt(p)}`;
}).join("");

/** Points along a Catmull-Rom curve, `per` samples per span. */
function sample(pts: Pt[], per = 6): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 1; k <= per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (j: 0 | 1) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  return out;
}

/**
 * A brushed ink stroke through the points: full weight in the middle, tapering
 * toward the ends (`taper` = the weight left at each end), with a faint
 * pressure wobble. Drawn as a filled shape so it reads like a pen line.
 */
function brush(pts: Pt[], w = LINE, taper: [number, number] = [0.45, 0.45], color = INK): string {
  const s = sample(pts, pts.length > 3 ? 4 : 7);
  const m = s.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const seed = pts[0][0] * 0.13 + pts[0][1] * 0.07;
  for (let i = 0; i < m; i++) {
    const [x, y] = s[i];
    const [ax, ay] = s[Math.max(0, i - 1)];
    const [bx, by] = s[Math.min(m - 1, i + 1)];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    const t = i / (m - 1);
    const ease = (v: number, floor: number) => floor + (1 - floor) * Math.min(1, v / 0.32);
    const f = ease(t, taper[0]) * ease(1 - t, taper[1]) * (1 + 0.08 * Math.sin(i * 1.9 + seed));
    const hw = (w * f) / 2;
    left.push([x + nx * hw, y + ny * hw]);
    right.push([x - nx * hw, y - ny * hw]);
  }
  right.reverse();
  const d = `M${left.map(pt).join("L")}L${right.map(pt).join("L")}Z`;
  return `<path d="${d}" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`;
}

const mirror = (left: string) => `${left}<g transform="matrix(-1 0 0 1 ${SIZE} 0)">${left}</g>`;
const stroke = (d: string, width = LINE, color = INK) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ink = (d: string, outline = true) => `<path d="${d}" fill="${INK}"${outline ? ` stroke="${INK}" stroke-width="${OUTLINE}" stroke-linejoin="round"` : ""}/>`;
/** White shape with an optional dotted tone, no outline. */
const skin = (d: string, tone: string | null, rule = "") => `<path d="${d}" fill="${PAPER}"${rule}/>${tone ? `<path d="${d}" fill="url(#${tone})"${rule}/>` : ""}`;
/** White shape with an optional dotted tone and the outline. */
const paper = (d: string, tone: string | null, rule = "") =>
  `<path d="${d}" fill="${PAPER}"${rule}/>${tone ? `<path d="${d}" fill="url(#${tone})"${rule}/>` : ""}<path d="${d}" fill="none" stroke="${INK}" stroke-width="${OUTLINE}" stroke-linejoin="round"${rule}/>`;

const DEFS =
  `<defs>` +
  `<pattern id="pf-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.5" fill="${INK}"/><circle cx="9" cy="9" r="1.5" fill="${INK}"/></pattern>` +
  `<pattern id="pf-light" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.4" fill="${INK}"/><circle cx="13" cy="13" r="1.4" fill="${INK}"/></pattern>` +
  `<pattern id="pf-dense" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="${INK}"/><circle cx="6" cy="6" r="1.5" fill="${INK}"/></pattern>` +
  `<pattern id="pf-hair" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1.75" cy="1.75" r="1.9" fill="${INK}"/><circle cx="5.25" cy="5.25" r="1.9" fill="${INK}"/></pattern>` +
  `<pattern id="pf-stubble" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="2.6" fill="${INK}"/><circle cx="10" cy="10" r="2.6" fill="${INK}"/></pattern>` +
  `</defs>`;

/* ───────── anchors ───────── */

type Ctx = {
  s: FaceSpec;
  h: Shape;
  top: number;
  chin: number;
  /** Mid-forehead hairline. */
  hy: number;
  eyeY: number;
  /** Eye centre distance from the middle. */
  ex: number;
  browY: number;
  noseTip: number;
  mouthY: number;
  /** Ear line and the ear's horizontal scale. */
  earY: number;
  earK: number;
  tone: string | null;
  /** The head's left edge at height y (the right edge mirrors it). */
  edge: (y: number) => number;
};

function anchors(s: FaceSpec): Ctx {
  const h = HEADS[s.head];
  const top = CY - h.ryT;
  const chin = CY + h.ryB;
  const eyeY = CY - 8;
  const mouthY = CY + h.ryB * 0.54;
  const outline = arc(h, PI / 2, (3 * PI) / 2, 0, 96);
  const edge = (y: number) => {
    for (let i = 1; i < outline.length; i++) {
      const [x0, y0] = outline[i - 1];
      const [x1, y1] = outline[i];
      if ((y0 >= y && y1 <= y) || (y0 <= y && y1 >= y)) return y1 === y0 ? x0 : x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
    }
    return CX - h.rx;
  };
  return {
    s,
    h,
    top,
    chin,
    hy: CY - h.ryT * 0.52,
    eyeY,
    ex: Math.max(44, Math.min(54, h.rx * 0.38)),
    browY: eyeY - 34,
    noseTip: eyeY + (mouthY - eyeY) * 0.64,
    mouthY,
    earY: eyeY + 22,
    earK: s.ears === "small" ? 0.78 : s.ears === "big" ? 1.22 : 1,
    tone: s.tone === "none" ? null : s.tone === "light" ? "pf-light" : s.tone === "dense" ? "pf-dense" : "pf-dots",
    edge,
  };
}

/* ───────── head and ears ───────── */

const headPath = (h: Shape) => smoothClosed(arc(h, 0, PI * 2, 0, 48).slice(0, 48));

/** The head outline as a brushed ring: a touch heavier along one cheek, like a pen drawn round once. */
function headOutline(h: Shape) {
  const w = (a: number) => (OUTLINE / 2) * (1 + 0.22 * Math.sin(2 * a + 0.6));
  const outer = arc(h, 0, PI * 2, (a) => w(a), 48).slice(0, 48);
  const inner = arc(h, PI * 2, 0, (a) => -w(a), 48).slice(0, 48);
  return `<path d="${smoothClosed(outer)}${smoothClosed(inner)}" fill="${INK}" fill-rule="evenodd"/>`;
}

function ear(c: Ctx) {
  const k = c.earK;
  const x = c.edge(c.earY) + 10;
  const y = c.earY;
  // A plain "C": out from the temple, round, back in at the jaw; the head covers the join.
  const d = `M${n(x + 4)} ${n(y - 34 * k)}C${n(x - 36 * k)} ${n(y - 50 * k)} ${n(x - 58 * k)} ${n(y + 8 * k)} ${n(x - 26 * k)} ${n(y + 30 * k)}C${n(x - 16 * k)} ${n(y + 37 * k)} ${n(x - 4)} ${n(y + 38 * k)} ${n(x + 4)} ${n(y + 34 * k)}Z`;
  const inner: Pt[] = [[x - 12 * k, y - 18 * k], [x - 30 * k, y - 10 * k], [x - 30 * k, y + 8 * k], [x - 16 * k, y + 14 * k]];
  return paper(d, c.tone) + brush(inner, 6, [0.35, 0.6]);
}

const HIDES_EARS = new Set<FaceSpec["hair"]>(["bob", "bangs", "long", "longWavy"]);

function ears(c: Ctx) {
  // Coverings and hair that falls past the ears hide them.
  if ((COVERED.has(c.s.hair) && c.s.hair !== "wrap") || HIDES_EARS.has(c.s.hair)) return "";
  return mirror(ear(c));
}

/* ───────── hair ───────── */

type HairLayers = { back?: string; front?: string; extra?: string };

/** Paints a hair shape in the chosen colour: flat ink, a dark stipple, or white with an outline. */
function paint(d: string, color: FaceSpec["hairColor"], rule = "") {
  if (color === "black") return `<path d="${d}" fill="${INK}" stroke="${INK}" stroke-width="${OUTLINE}" stroke-linejoin="round"${rule}/>`;
  return paper(d, color === "grey" ? "pf-hair" : null, rule);
}
/** Strand lines inside a hair shape, in the contrasting colour. */
const strands = (color: FaceSpec["hairColor"], ...lines: Pt[][]) => lines.map((l) => brush(l, color === "black" ? 4.5 : 5, [0.3, 0.2], color === "black" ? PAPER : INK)).join("");

function hairLayers(c: Ctx): HairLayers {
  const { s, h, hy, top } = c;
  const color = s.hairColor;
  const L = (d: number, a = PI + 0.14) => headPoint(h, a, d);
  const R = (d: number, a = 2 * PI - 0.14) => headPoint(h, a, d);
  const hairline = (lift = 0): Pt[] => [R(-4), [CX + h.rx * 0.62, hy + 12 - lift], [CX + h.rx * 0.2, hy - lift], [CX - h.rx * 0.3, hy + 2 - lift], [CX - h.rx * 0.66, hy + 12 - lift], L(-4)];
  /** A fringe of little tufts from right to left: "u" shapes hanging at `y`, rising to the temples at the ends. */
  const tufts = (from: Pt, to: Pt, count: number, y: number, depth = 12): string => {
    const pts: Pt[] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const end = from[1] + (to[1] - from[1]) * t;
      pts.push([from[0] + (to[0] - from[0]) * t, y + (end - y) * Math.pow(Math.abs(2 * t - 1), 4)]);
    }
    return pts.slice(1).map((p, i) => `Q${n((pts[i][0] + p[0]) / 2)} ${n(Math.max(pts[i][1], p[1]) + depth)} ${pt(p)}`).join("");
  };
  /** Side panels and length behind the head, down to `bottom`, `w` wide past the head. */
  const length = (bottom: number, w: number, wave = 0): string => {
    const crown = arc(h, PI + 0.1, 2 * PI - 0.1, 22);
    const side = (dir: 1 | -1): Pt[] => {
      const out: Pt[] = [];
      for (let i = 0; i <= 6; i++) {
        const y = CY + 20 + ((bottom - CY - 20) * i) / 6;
        out.push([CX + dir * (h.rx + w - (i === 6 ? 14 : 0) + (wave && i % 2 ? wave : 0)), y]);
      }
      return out;
    };
    const right = side(1);
    const left = side(-1).reverse();
    return runs([...crown, ...right], [...left, crown[0]]);
  };

  switch (s.hair) {
    case "none":
      return {};
    case "receding": {
      const side = runs(arc(h, PI - 0.06, PI + 0.72, 6, 8), [[CX - h.rx * 0.62, hy + 6], [CX - h.rx * 0.8, CY - 30], [CX - h.rx + 4, c.earY - 30]]);
      return { front: mirror(color === "black" ? `<path d="${side}" fill="${PAPER}"/><path d="${side}" fill="url(#pf-hair)"/>${stroke(side, OUTLINE)}` : paint(side, color)) };
    }
    case "buzz": {
      const d = runs(arc(h, PI + 0.12, 2 * PI - 0.12, 4), hairline(-6));
      const fill = color === "black" ? "pf-hair" : color === "grey" ? "pf-dense" : "pf-light";
      return { front: `<path d="${d}" fill="${PAPER}"/><path d="${d}" fill="url(#${fill})"/>` + stroke(d, OUTLINE) };
    }
    case "crew":
      return { front: paint(runs(arc(h, PI + 0.1, 2 * PI - 0.1, 9), [R(-4, 2 * PI - 0.12), [CX + h.rx * 0.6, hy + 4], [CX, hy - 6], [CX - h.rx * 0.6, hy + 4], L(-4, PI + 0.12)]), color) };
    case "short": {
      // A little more volume on the parting side and a soft dip at the middle of the hairline.
      const volume = (a: number) => 12 + 8 * Math.max(0, Math.sin((a - PI) * 1.2));
      const line: Pt[] = [R(-4, 2 * PI - 0.1), [CX + h.rx * 0.7, hy + 16], [CX + h.rx * 0.36, hy - 2], [CX + h.rx * 0.08, hy + 6], [CX - h.rx * 0.22, hy - 4], [CX - h.rx * 0.6, hy + 4], [CX - h.rx * 0.8, hy + 22], L(-4, PI + 0.1)];
      return { front: paint(runs(arc(h, PI + 0.1, 2 * PI - 0.1, volume), line), color) };
    }
    case "sidePart": {
      // Volume on the right, a parting on the left, a flick past the head.
      const volume = (a: number) => 12 + 30 * Math.max(0, Math.sin((a - PI - 0.6) * 1.6));
      const outer = arc(h, PI + 0.14, 2 * PI - 0.06, volume);
      const d = runs([...outer, [CX + h.rx + 30, CY - h.ryT * 0.42]], [R(-4, 2 * PI - 0.2), [CX + h.rx * 0.5, hy + 18], [CX - h.rx * 0.05, hy - 6], [CX - h.rx * 0.45, hy - 2], [CX - h.rx * 0.7, hy + 14], L(-4)]);
      return { front: paint(d, color) + strands(color, [[CX - h.rx * 0.32, hy - 18], [CX + h.rx * 0.1, top - 4], [CX + h.rx * 0.5, top + 10]]) };
    }
    case "quiff": {
      const volume = (a: number) => 10 + 40 * Math.exp(-(((a - 1.42 * PI) / 0.34) ** 2));
      const d = runs(arc(h, PI + 0.1, 2 * PI - 0.1, volume, 20), [R(-4, 2 * PI - 0.12), [CX + h.rx * 0.6, hy + 8], [CX + h.rx * 0.15, hy - 6], [CX - h.rx * 0.35, hy - 12], [CX - h.rx * 0.72, hy + 8], L(-4, PI + 0.12)]);
      return { front: paint(d, color) + strands(color, [[CX - h.rx * 0.5, hy - 20], [CX - h.rx * 0.25, top - 26], [CX + h.rx * 0.15, top - 20]]) };
    }
    case "slick": {
      const d = runs(arc(h, PI + 0.16, 2 * PI - 0.16, 8), [R(-4, 2 * PI - 0.2), [CX + h.rx * 0.56, hy - 2], [CX + h.rx * 0.26, hy - 14], [CX, hy - 6], [CX - h.rx * 0.26, hy - 14], [CX - h.rx * 0.56, hy - 2], L(-4, PI + 0.2)]);
      const comb = [-0.3, 0, 0.3].map((f): Pt[] => [[CX + h.rx * f, hy - 16], [CX + h.rx * f * 1.2, top + 12], [CX + h.rx * f * 1.3, top - 2]]);
      return { front: paint(d, color) + strands(color, ...comb) };
    }
    case "spiky": {
      // Alternating tips and roots along the skull, the tips longest at the crown.
      const outer = arc(h, PI + 0.08, 2 * PI - 0.08, 8, 16).map((p, i, all): Pt => {
        if (i % 2 === 0) return p;
        const lift = 14 + 22 * Math.sin((PI * i) / (all.length - 1));
        const [x, y] = p;
        const r = Math.hypot(x - CX, y - CY);
        return [x + ((x - CX) / r) * lift, y + ((y - CY) / r) * lift];
      });
      const line = hairline(4);
      return { front: paint(`M${outer.map(pt).join("L")}L${pt(line[0])}${through(line)}Z`, color) };
    }
    case "messy": {
      const outer = arc(h, PI + 0.06, 2 * PI - 0.06, (a) => 18 + 7 * Math.sin(a * 9) + 5 * Math.sin(a * 5 + 1), 22);
      const from = R(-4, 2 * PI - 0.06);
      const to = L(-4, PI + 0.06);
      return { front: paint(`M${pt(outer[0])}${through(outer)}L${pt(from)}${tufts(from, to, 9, hy + 18, 16)}Z`, color) };
    }
    case "curly": {
      const pts = arc(h, PI - 0.05, 2 * PI + 0.05, 26, 12);
      const from = R(-6, 2 * PI + 0.02);
      const to = L(-6, PI - 0.02);
      return { front: paint(`M${pt(pts[0])}${scallop(pts)}L${pt(from)}${tufts(from, to, 8, hy + 14, 14)}Z`, color) };
    }
    case "afro": {
      const pts = arc(h, PI - 0.7, 2 * PI + 0.7, (a) => 62 + 6 * Math.sin(a * 6), 16);
      const back = `M${pt(pts[0])}${scallop(pts, 0.6)}L${n(CX + h.rx * 0.6)} ${n(CY + 60)}L${n(CX - h.rx * 0.6)} ${n(CY + 60)}Z`;
      const from = R(-4, 2 * PI - 0.02);
      const to = L(-4, PI + 0.02);
      const cap = arc(h, PI + 0.02, 2 * PI - 0.02, 2, 10);
      return { back: paint(back, color), front: paint(`M${pt(cap[0])}${through(cap)}L${pt(from)}${tufts(from, to, 8, hy + 6, 10)}Z`, color) };
    }
    case "wavy": {
      const sweep = (a: number) => 20 + 6 * Math.sin(a * 10);
      const fringe = runs(arc(h, PI + 0.02, 2 * PI - 0.02, sweep, 20), [R(-4, 2 * PI - 0.04), [CX + h.rx * 0.72, hy + 34], [CX + h.rx * 0.3, hy + 10], [CX - h.rx * 0.2, hy - 4], [CX - h.rx * 0.62, hy + 8], L(-4, PI + 0.04)]);
      return { back: paint(length(CY + 96, 30, 10), color), front: paint(fringe, color) + strands(color, [[CX + h.rx * 0.6, hy - 10], [CX + h.rx * 0.2, top + 6], [CX - h.rx * 0.2, top - 6]]) };
    }
    case "bob":
    case "long":
    case "longWavy":
    case "bangs": {
      const down = s.hair === "bob" || s.hair === "bangs" ? 0.62 : 1.0;
      const outer = arc(h, PI - down, 2 * PI + down, s.hair === "longWavy" ? (a) => 22 + 6 * Math.sin(a * 12) : 22, 24);
      const bangs = s.hair === "bangs" ? CY - h.ryT * 0.34 : CY - h.ryT * 0.47;
      const right = arc(h, down, -0.12, -22, 6);
      const left = arc(h, PI + 0.12, PI - down, -22, 6);
      const fringe: Pt[] = s.hair === "bangs" ? [[CX + h.rx * 0.74, bangs], [CX, bangs + 4], [CX - h.rx * 0.74, bangs]] : [[CX + h.rx * 0.62, bangs + 4], [CX + h.rx * 0.2, bangs - 2], [CX - h.rx * 0.25, bangs + 6], [CX - h.rx * 0.62, bangs]];
      const bottom = s.hair === "bob" || s.hair === "bangs" ? CY + 112 : CY + 185;
      return { back: paint(length(bottom, s.hair === "bob" || s.hair === "bangs" ? 30 : 36, s.hair === "longWavy" ? 12 : 0), color), front: paint(runs(outer, [...right, ...fringe, ...left]), color) };
    }
    case "ponytail": {
      const tail = `M${pt(R(0, 2 * PI - 0.62))}C${n(CX + h.rx + 70)} ${n(top + 20)} ${n(CX + h.rx + 86)} ${n(CY + 90)} ${n(CX + h.rx + 40)} ${n(CY + 150)}C${n(CX + h.rx + 52)} ${n(CY + 70)} ${n(CX + h.rx + 30)} ${n(CY - 30)} ${pt(R(0, 2 * PI - 0.2))}Z`;
      const cap = runs(arc(h, PI + 0.12, 2 * PI - 0.12, 10), hairline(8));
      const tie = brush([R(14, 2 * PI - 0.5), R(26, 2 * PI - 0.3)], 12, [0.9, 0.9], color === "black" ? PAPER : INK);
      return { back: paint(tail, color), front: paint(cap, color) + tie + strands(color, [[CX - h.rx * 0.4, hy - 14], [CX, top + 4], [CX + h.rx * 0.6, top + 30]]) };
    }
    case "bun": {
      const bun = `M${n(CX - 46)} ${n(top - 26)}a46 44 0 1 1 92 0a46 44 0 1 1 -92 0Z`;
      return { back: paint(bun, color), front: paint(runs(arc(h, PI + 0.2, 2 * PI - 0.2, 10), hairline(16)), color) + strands(color, [[CX - h.rx * 0.3, hy - 12], [CX - 8, top + 4]], [[CX + h.rx * 0.3, hy - 12], [CX + 8, top + 4]]) };
    }
    case "braid": {
      const cap = runs(arc(h, PI + 0.06, 2 * PI - 0.06, 12), [R(-4, 2 * PI - 0.08), [CX + h.rx * 0.6, hy + 14], [CX + 6, hy - 6], [CX - 6, hy - 6], [CX - h.rx * 0.6, hy + 14], L(-4, PI + 0.08)]);
      const x = CX - h.rx - 4;
      const links = [0, 1, 2, 3, 4, 5].map((i) => {
        const y = c.earY - 6 + i * 36;
        const w = 26 - i * 1.8;
        return `M${n(x - w)} ${n(y)}Q${n(x)} ${n(y - 26)} ${n(x + w)} ${n(y)}Q${n(x)} ${n(y + 34)} ${n(x - w)} ${n(y)}Z`;
      }).join("");
      return { front: paint(cap, color) + paint(links, color) + strands(color, [[CX, hy - 6], [CX, top + 2]]) };
    }
    case "hijab":
    case "headscarf":
    case "wrap":
      return {};
  }
}

/* ───────── head coverings ───────── */

function hijab(c: Ctx) {
  const { h, top, chin } = c;
  const color = c.s.hairColor;
  const r = h.rx + 44;
  const outer = runs([[CX - r - 34, 470], [CX - r - 8, chin - 30], [CX - r, CY - 30], [CX - h.rx * 0.7, top - 22], [CX, top - 36], [CX + h.rx * 0.7, top - 22], [CX + r, CY - 30], [CX + r + 8, chin - 30], [CX + r + 34, 470]]);
  const ceiling = CY - h.ryT * 0.55;
  const opening = arc(h, 0, PI * 2, -14, 48).slice(0, 48).map(([x, y]): Pt => [x, Math.max(y, ceiling + Math.abs(x - CX) * 0.25)]);
  const fold = color === "black" ? "" : brush([[CX - r + 10, chin + 10], [CX - h.rx * 0.6, chin + 36], [CX, chin + 50]], 5, [0.2, 0.2]);
  return paint(`${outer}${smoothClosed(opening)}`, color, ` fill-rule="evenodd"`) + fold + stroke(smoothClosed(opening), OUTLINE);
}

/** A scarf tied at the nape: covers the crown, a little hair shows at the forehead, a knot behind. */
function headscarf(c: Ctx) {
  const { h, hy } = c;
  const color = c.s.hairColor;
  const scarf = runs(arc(h, PI + 0.02, 2 * PI - 0.02, 20, 20), [headPoint(h, 2 * PI - 0.02, -2), [CX + h.rx * 0.6, hy + 2], [CX, hy - 8], [CX - h.rx * 0.6, hy + 2], headPoint(h, PI + 0.02, -2)]);
  const [kx, ky] = headPoint(h, 2 * PI - 0.05, 24);
  const knot = `M${n(kx - 6)} ${n(ky - 8)}C${n(kx + 40)} ${n(ky - 30)} ${n(kx + 56)} ${n(ky + 10)} ${n(kx + 34)} ${n(ky + 60)}C${n(kx + 26)} ${n(ky + 30)} ${n(kx + 12)} ${n(ky + 20)} ${n(kx - 4)} ${n(ky + 18)}Z`;
  const hair = runs([headPoint(h, 2 * PI - 0.3, -4), [CX + h.rx * 0.4, hy + 18], [CX, hy + 10], [CX - h.rx * 0.4, hy + 18], headPoint(h, PI + 0.3, -4)], [[CX - h.rx * 0.4, hy + 2], [CX + h.rx * 0.4, hy + 2]]);
  const folds = brush([[CX - h.rx * 0.5, hy - 26], [CX, c.top + 10], [CX + h.rx * 0.5, hy - 22]], 5, [0.2, 0.2], color === "black" ? PAPER : INK);
  return { back: paint(knot, color), front: ink(hair) + paint(scarf, color) + folds };
}

/** A wrapped head covering: folds crossing over the forehead, ears left free. */
function wrap(c: Ctx) {
  const { h, hy, top } = c;
  const color = c.s.hairColor;
  const shape = runs(arc(h, PI + 0.04, 2 * PI - 0.04, (a) => 22 + 10 * Math.sin(a - PI), 20), [headPoint(h, 2 * PI - 0.04, -2), [CX + h.rx * 0.5, hy + 10], [CX, hy + 22], [CX - h.rx * 0.5, hy + 10], headPoint(h, PI + 0.04, -2)]);
  const lineColor = color === "black" ? PAPER : INK;
  const folds = [
    brush([[CX - h.rx * 0.9, hy - 6], [CX - h.rx * 0.2, hy - 10], [CX + 4, hy + 18]], 5, [0.2, 0.3], lineColor),
    brush([[CX + h.rx * 0.9, hy - 20], [CX + h.rx * 0.2, hy - 26], [CX - 4, hy + 14]], 5, [0.2, 0.3], lineColor),
    brush([[CX - h.rx * 0.7, top + 10], [CX, top - 6], [CX + h.rx * 0.6, top + 4]], 5, [0.2, 0.2], lineColor),
  ].join("");
  return paint(shape, color) + folds;
}

/* ───────── features ───────── */

function details(c: Ctx) {
  const { ex, eyeY, mouthY, noseTip, browY } = c;
  const x = CX - ex;
  switch (c.s.details) {
    case "none":
      return "";
    case "freckles":
      return mirror([[-14, 40], [0, 46], [14, 40], [-6, 56], [8, 56]].map(([dx, dy]) => `<circle cx="${n(x + dx)}" cy="${n(eyeY + dy)}" r="3" fill="${INK}"/>`).join(""));
    case "blush":
      return mirror([-14, 0, 14].map((dx) => brush([[x + dx - 4, eyeY + 60], [x + dx + 6, eyeY + 44]], 4.5, [0.5, 0.5])).join(""));
    case "mole":
      return `<circle cx="${n(CX + ex + 6)}" cy="${n(mouthY - 18)}" r="4.5" fill="${INK}"/>`;
    case "wrinkles":
      return [0, 14].map((dy) => brush([[CX - 44 + dy, browY - 34 - dy], [CX, browY - 40 - dy], [CX + 44 - dy, browY - 34 - dy]], 5, [0.2, 0.2])).join("");
    case "ageLines":
      return mirror(brush([[x - 30, eyeY - 6], [x - 40, eyeY - 10]], 4.5, [0.3, 0.3]) + brush([[x - 30, eyeY + 4], [x - 40, eyeY + 8]], 4.5, [0.3, 0.3]) + brush([[CX - 30, noseTip + 4], [CX - 40, noseTip + 26], [CX - 40, mouthY + 4]], 5, [0.25, 0.25]));
    case "eyeBags":
      return mirror(brush([[x - 14, eyeY + 18], [x, eyeY + 24], [x + 14, eyeY + 18]], 4.5, [0.2, 0.2]));
    case "dimples":
      return mirror(brush([[CX - 46, mouthY - 10], [CX - 50, mouthY], [CX - 46, mouthY + 8]], 5, [0.3, 0.3]));
  }
}

function facialHair(c: Ctx, layer: "under" | "over") {
  const { s, h, mouthY } = c;
  if (s.facialHair === "none") return "";
  const color = s.hairColor;
  const lip = mouthY - 14;
  const moustache = (droop = 0) => `M${n(CX - 38)} ${n(mouthY - 8 + droop)}Q${n(CX - 24)} ${n(mouthY - 32)} ${n(CX)} ${n(mouthY - 24)}Q${n(CX + 24)} ${n(mouthY - 32)} ${n(CX + 38)} ${n(mouthY - 8 + droop)}Q${n(CX + 18)} ${n(mouthY - 16)} ${n(CX)} ${n(mouthY - 12)}Q${n(CX - 18)} ${n(mouthY - 16)} ${n(CX - 38)} ${n(mouthY - 8 + droop)}Z`;
  /** The beard band: outside along the jaw (with a hang at the chin), inside drawn in toward the mouth. */
  const band = (from: number, depth: number, hang: number, inset = 0) => {
    const outer = arc(h, from, PI - from, (a) => hang * Math.pow(Math.max(0, Math.sin(a)), 4), 20);
    const inner = arc(h, PI - from, from, -inset, 20).map(([x, y]): Pt => [x + (CX - x) * depth, y + (lip - y) * depth]);
    return runs(outer, inner);
  };
  /** A white island so the mouth reads inside a full beard. */
  const island = `<path d="M${n(CX - 46)} ${n(mouthY - 4)}Q${CX} ${n(mouthY - 22)} ${n(CX + 46)} ${n(mouthY - 4)}Q${n(CX + 40)} ${n(mouthY + 30)} ${CX} ${n(mouthY + 32)}Q${n(CX - 40)} ${n(mouthY + 30)} ${n(CX - 46)} ${n(mouthY - 4)}Z" fill="${PAPER}"/>`;
  const hairPaint = (d: string) => paint(d, color);

  if (layer === "under") {
    switch (s.facialHair) {
      case "stubble":
        return `<path d="${band(0.12, 0.36, 0)}" fill="url(#pf-stubble)"/>`;
      case "chinStrap":
        return hairPaint(band(0.02, 0.12, 4, 4));
      case "beardShort":
        return hairPaint(band(0.12, 0.42, 0)) + island;
      case "beardFull":
        return hairPaint(band(-0.02, 0.5, 26)) + island;
      case "beardLong":
        return hairPaint(band(0.1, 0.44, 76)) + island;
      case "goatee":
        return hairPaint(`M${n(CX - 44)} ${n(mouthY - 6)}Q${n(CX - 50)} ${n(c.chin - 6)} ${CX} ${n(c.chin + 14)}Q${n(CX + 50)} ${n(c.chin - 6)} ${n(CX + 44)} ${n(mouthY - 6)}Z`) + island;
      case "soulPatch":
        return hairPaint(`M${n(CX - 10)} ${n(mouthY + 20)}L${n(CX + 10)} ${n(mouthY + 20)}L${CX} ${n(mouthY + 40)}Z`);
      default:
        return "";
    }
  }
  switch (s.facialHair) {
    case "moustache":
    case "goatee":
    case "beardShort":
    case "beardFull":
    case "beardLong":
      return hairPaint(moustache());
    case "handlebar":
      return hairPaint(moustache(-2)) + stroke(`M${n(CX - 36)} ${n(mouthY - 8)}q-16 2 -16 -14q2 -8 8 -6`, 7) + stroke(`M${n(CX + 36)} ${n(mouthY - 8)}q16 2 16 -14q-2 -8 -8 -6`, 7);
    case "walrus":
      return hairPaint(`M${n(CX - 46)} ${n(mouthY + 8)}Q${n(CX - 36)} ${n(mouthY - 34)} ${CX} ${n(mouthY - 28)}Q${n(CX + 36)} ${n(mouthY - 34)} ${n(CX + 46)} ${n(mouthY + 8)}Q${CX} ${n(mouthY - 4)} ${n(CX - 46)} ${n(mouthY + 8)}Z`);
    default:
      return "";
  }
}

function eyes(c: Ctx) {
  const x = CX - c.ex;
  const y = c.eyeY;
  const dot = (dx = 0, r = 8.5) => `<ellipse cx="${n(x + dx)}" cy="${n(y + 2)}" rx="${r}" ry="${n(r * 1.18)}" fill="${INK}"/>`;
  const lid = (lift = 0) => brush([[x - 20, y + 2 - lift], [x - 4, y - 10 - lift], [x + 18, y - 2 - lift]], LINE, [0.35, 0.5]);
  const happy = brush([[x - 18, y + 8], [x, y - 12], [x + 18, y + 8]], LINE, [0.35, 0.35]);
  const open = (dx: number) => stroke(`M${x - 22} ${y}Q${x} ${y - 20} ${x + 22} ${y}Q${x} ${y + 14} ${x - 22} ${y}Z`, 6) + `<circle cx="${n(x + dx)}" cy="${y - 1}" r="7.5" fill="${INK}"/>`;
  switch (c.s.eyes) {
    case "dot":
      return mirror(dot());
    case "open":
      return mirror(open(2));
    case "side":
      return open(9) + `<g transform="matrix(-1 0 0 1 ${SIZE} 0)">${open(-9)}</g>`;
    case "lidded":
      return mirror(lid(4) + dot(2, 8));
    case "happy":
      return mirror(happy);
    case "closed":
      return mirror(brush([[x - 18, y - 2], [x, y + 10], [x + 18, y - 2]], LINE, [0.35, 0.35]));
    case "wide":
      return mirror(`<circle cx="${x}" cy="${y}" r="16" fill="${PAPER}" stroke="${INK}" stroke-width="6"/><circle cx="${x + 2}" cy="${y + 2}" r="6.5" fill="${INK}"/>`);
    case "small":
      return mirror(`<circle cx="${x}" cy="${y + 2}" r="5.5" fill="${INK}"/>`);
    case "wink":
      return dot() + `<g transform="matrix(-1 0 0 1 ${SIZE} 0)">${happy}</g>`;
    case "lashes":
      return mirror(lid(4) + dot(2, 8) + brush([[x - 18, y - 4], [x - 26, y - 12]], 4.5, [0.6, 0.3]) + brush([[x - 10, y - 12], [x - 14, y - 22]], 4.5, [0.6, 0.3]));
    case "tired":
      return mirror(dot(0, 8.5) + `<path d="M${x - 14} ${y - 4}H${x + 14}V${y - 14}H${x - 14}Z" fill="${PAPER}"/>` + brush([[x - 16, y - 3], [x + 16, y - 3]], 7, [0.5, 0.5]));
  }
}

function brows(c: Ctx) {
  const { s, h } = c;
  const x = CX - c.ex;
  let y = c.browY - (s.brows === "raised" ? 10 : 0);
  // Bangs sit low: keep brows just under the fringe.
  if (s.hair === "long" || s.hair === "bob" || s.hair === "longWavy") y = Math.max(y, CY - h.ryT * 0.47 + 18);
  if (s.hair === "bangs") y = Math.max(y, CY - h.ryT * 0.34 + 16);
  switch (s.brows) {
    case "straight":
      return mirror(brush([[x - 22, y + 3], [x + 20, y]], LINE + 1, [0.6, 0.5]));
    case "arched":
    case "raised":
      return mirror(brush([[x - 24, y + 6], [x - 4, y - 9], [x + 22, y + 2]], LINE + 1, [0.4, 0.6]));
    case "thick":
      return mirror(brush([[x - 26, y + 4], [x - 4, y - 6], [x + 24, y]], 15, [0.5, 0.8]));
    case "angry":
      return mirror(brush([[x - 22, y - 6], [x + 22, y + 8]], LINE + 2, [0.5, 0.8]));
    case "worried":
      return mirror(brush([[x - 22, y + 6], [x + 4, y], [x + 20, y - 10]], LINE + 1, [0.5, 0.7]));
    case "bushy":
      return mirror(brush([[x - 26, y + 6], [x - 2, y - 6], [x + 24, y + 2]], 17, [0.7, 0.8]) + brush([[x - 18, y - 4], [x - 6, y - 10]], 6, [0.3, 0.6]));
    case "thin":
      return mirror(brush([[x - 22, y + 4], [x - 2, y - 6], [x + 20, y]], 4.5, [0.4, 0.4]));
    case "none":
      return "";
  }
}

function nose(c: Ctx) {
  const { eyeY: y, noseTip: t } = c;
  switch (c.s.nose) {
    case "line":
      return brush([[CX - 2, y - 2], [CX - 6, t - 24], [CX - 10, t]], LINE, [0.3, 0.9]) + brush([[CX - 10, t], [CX + 12, t + 2]], LINE, [0.9, 0.5]);
    case "long":
      return brush([[CX - 4, y + 2], [CX + 8, t - 30], [CX + 20, t - 4], [CX + 10, t + 8], [CX - 12, t + 2]], LINE, [0.3, 0.4]);
    case "button":
      return brush([[CX - 16, t - 12], [CX - 18, t + 2], [CX, t + 8], [CX + 18, t + 2], [CX + 16, t - 12]], LINE, [0.3, 0.3]);
    case "small":
      return brush([[CX - 2, t - 22], [CX + 10, t - 4], [CX - 6, t + 2]], LINE - 1, [0.3, 0.4]);
    case "wide":
      return brush([[CX - 26, t - 10], [CX - 18, t + 4], [CX - 6, t]], LINE - 1, [0.3, 0.5]) + brush([[CX + 26, t - 10], [CX + 18, t + 4], [CX + 6, t]], LINE - 1, [0.3, 0.5]) + brush([[CX + 2, y + 8], [CX - 2, t - 20]], LINE - 1, [0.2, 0.3]);
    case "pointy":
      return brush([[CX + 4, y + 6], [CX - 18, t + 2]], LINE, [0.3, 0.9]) + brush([[CX - 18, t + 2], [CX + 6, t + 6]], LINE, [0.9, 0.4]);
    case "angular":
      return brush([[CX - 8, y + 2], [CX + 12, t]], LINE, [0.3, 0.9]) + brush([[CX + 12, t], [CX - 8, t + 4]], LINE, [0.9, 0.4]);
    case "round":
      return brush([[CX - 8, t - 22], [CX - 18, t - 2], [CX, t + 8], [CX + 18, t - 2], [CX + 8, t - 22]], LINE, [0.25, 0.25]);
  }
}

function mouth(c: Ctx) {
  const y = c.mouthY;
  switch (c.s.mouth) {
    case "neutral":
      return brush([[CX - 28, y], [CX, y + 4], [CX + 28, y - 1]], LINE, [0.4, 0.4]);
    case "smile":
      return brush([[CX - 32, y - 8], [CX, y + 12], [CX + 32, y - 8]], LINE, [0.4, 0.4]);
    case "grin":
      return `<path d="M${CX - 40} ${y - 10}Q${CX} ${y - 2} ${CX + 40} ${y - 10}Q${CX + 34} ${y + 34} ${CX} ${y + 36}Q${CX - 34} ${y + 34} ${CX - 40} ${y - 10}Z" fill="${INK}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
    case "small":
      return brush([[CX - 12, y + 1], [CX, y + 6], [CX + 12, y + 1]], LINE - 1, [0.5, 0.5]);
    case "smirk":
      return brush([[CX - 26, y + 2], [CX + 8, y + 4], [CX + 28, y - 10]], LINE, [0.4, 0.4]);
    case "open":
      return `<ellipse cx="${CX}" cy="${y + 4}" rx="13" ry="16" fill="${INK}"/>`;
    case "frown":
      return brush([[CX - 28, y + 8], [CX, y - 6], [CX + 28, y + 8]], LINE, [0.4, 0.4]);
    case "teeth":
      return `<path d="M${CX - 36} ${y - 8}Q${CX} ${y - 2} ${CX + 36} ${y - 8}Q${CX + 30} ${y + 28} ${CX} ${y + 28}Q${CX - 30} ${y + 28} ${CX - 36} ${y - 8}Z" fill="${INK}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="M${CX - 28} ${y - 3}Q${CX} ${y + 2} ${CX + 28} ${y - 3}L${CX + 25} ${y + 7}Q${CX} ${y + 11} ${CX - 25} ${y + 7}Z" fill="${PAPER}"/>`;
    case "flat":
      return brush([[CX - 24, y + 2], [CX + 24, y + 2]], LINE, [0.6, 0.6]);
    case "bigSmile":
      return brush([[CX - 40, y - 12], [CX - 20, y + 10], [CX + 20, y + 10], [CX + 40, y - 12]], LINE, [0.4, 0.4]) + mirror(brush([[CX - 46, y - 18], [CX - 36, y - 8]], 5, [0.3, 0.6]));
    case "pout":
      return stroke(`M${CX - 16} ${y}Q${CX - 8} ${y - 10} ${CX} ${y - 4}Q${CX + 8} ${y - 10} ${CX + 16} ${y}Q${CX} ${y + 16} ${CX - 16} ${y}Z`, 6);
  }
}

function glasses(c: Ctx) {
  const x = CX - c.ex;
  const y = c.eyeY + 2;
  const templeTo = c.edge(y - 8) + 4;
  const temple = (from: number) => stroke(`M${n(from)} ${y - 6}L${n(templeTo)} ${y - 10}`, 7);
  const bridge = (lift: number) => stroke(`M${n(CX - c.ex + 32)} ${y - lift}Q${CX} ${y - lift - 10} ${n(CX + c.ex - 32)} ${y - lift}`, 7);
  const W = LINE;
  switch (c.s.glasses) {
    case "none":
      return "";
    case "round":
      return mirror(`<circle cx="${x}" cy="${y}" r="31" fill="none" stroke="${INK}" stroke-width="${W}"/>` + temple(x - 31)) + bridge(6);
    case "rect":
      return mirror(`<rect x="${x - 38}" y="${y - 24}" width="76" height="48" rx="8" fill="none" stroke="${INK}" stroke-width="${W}"/>` + temple(x - 38)) + bridge(8);
    case "browline":
      return mirror(`<rect x="${x - 36}" y="${y - 22}" width="72" height="44" rx="14" fill="none" stroke="${INK}" stroke-width="4"/>` + `<path d="M${x - 38} ${y - 10}Q${x - 36} ${y - 26} ${x - 18} ${y - 26}H${x + 22}Q${x + 38} ${y - 26} ${x + 38} ${y - 12}" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>` + temple(x - 38)) + bridge(14);
    case "aviator":
      return mirror(`<path d="M${x - 36} ${y - 22}H${x + 32}Q${x + 38} ${y - 22} ${x + 34} ${y - 4}Q${x + 26} ${y + 30} ${x - 6} ${y + 30}Q${x - 38} ${y + 28} ${x - 38} ${y - 10}Q${x - 38} ${y - 22} ${x - 36} ${y - 22}Z" fill="none" stroke="${INK}" stroke-width="6"/>` + temple(x - 38)) + stroke(`M${n(CX - c.ex + 34)} ${y - 18}H${n(CX + c.ex - 34)}`, 6) + bridge(4);
    case "cateye":
      return mirror(`<path d="M${x - 40} ${y - 24}Q${x} ${y - 20} ${x + 32} ${y - 16}Q${x + 36} ${y + 20} ${x} ${y + 22}Q${x - 34} ${y + 20} ${x - 40} ${y - 24}Z" fill="none" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>` + temple(x - 36)) + bridge(10);
    case "reading":
      return mirror(`<path d="M${x - 30} ${y + 2}H${x + 30}Q${x + 30} ${y + 26} ${x} ${y + 26}Q${x - 30} ${y + 26} ${x - 30} ${y + 2}Z" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>` + stroke(`M${x - 30} ${y + 2}L${n(templeTo)} ${y - 8}`, 6)) + stroke(`M${n(CX - c.ex + 30)} ${y + 2}Q${CX} ${y - 8} ${n(CX + c.ex - 30)} ${y + 2}`, 6);
    case "sunglasses":
      return mirror(`<path d="M${x - 38} ${y - 20}H${x + 34}Q${x + 36} ${y + 22} ${x} ${y + 24}Q${x - 36} ${y + 22} ${x - 38} ${y - 20}Z" fill="${INK}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>` + stroke(`M${x - 28} ${y - 8}L${x - 16} ${y - 14}`, 4, PAPER) + temple(x - 38)) + bridge(14);
  }
}

function headwear(c: Ctx) {
  const { s, h, top } = c;
  const lobe = (dx = 0): Pt => [c.edge(c.earY) - 18 * c.earK + dx, c.earY + 30 * c.earK];
  switch (s.headwear) {
    case "none":
      return "";
    case "doppi": {
      // The Uzbek skullcap: a low four-sided crown with white almond motifs.
      const [lx, ly] = headPoint(h, PI + 0.62, 6);
      const [rx, ry] = headPoint(h, 2 * PI - 0.62, 6);
      const d = `M${n(lx)} ${n(ly)}L${n(lx + 10)} ${n(top - 22)}Q${CX} ${n(top - 36)} ${n(rx - 10)} ${n(top - 22)}L${n(rx)} ${n(ry)}Q${CX} ${n(ly - 22)} ${n(lx)} ${n(ly)}Z`;
      const motif = (x: number) => `<path d="M${n(x)} ${n(ly - 22)}c-16 -8 -16 -30 0 -38c-6 12 6 18 0 38z" fill="${PAPER}"/>`;
      return ink(d) + motif(CX - 58) + motif(CX - 6) + motif(CX + 46);
    }
    case "cap": {
      const brim = CY - h.ryT * 0.48;
      const dome = arc(h, PI + 0.32, 2 * PI - 0.32, 14);
      const d = `M${pt(dome[0])}${through(dome)}Q${CX} ${n(brim - 18)} ${pt(dome[0])}Z`;
      const visor = `M${n(CX - h.rx * 0.2)} ${n(brim - 8)}Q${n(CX + h.rx * 0.6)} ${n(brim - 26)} ${n(CX + h.rx + 74)} ${n(brim + 6)}Q${n(CX + h.rx * 0.6)} ${n(brim + 6)} ${n(CX - h.rx * 0.2)} ${n(brim - 8)}Z`;
      return ink(d) + ink(visor) + `<circle cx="${CX}" cy="${n(top - 12)}" r="9" fill="${INK}"/>`;
    }
    case "beanie": {
      const band = CY - h.ryT * 0.42;
      const dome = arc(h, PI + 0.24, 2 * PI - 0.24, 18);
      const d = `M${pt(dome[0])}${through(dome)}L${n(CX + h.rx + 14)} ${n(band)}Q${CX} ${n(band + 12)} ${n(CX - h.rx - 14)} ${n(band)}Z`;
      const ribs = [-90, -54, -18, 18, 54, 90].map((dx) => stroke(`M${CX + dx} ${n(band - 30)}L${CX + dx} ${n(band - 4)}`, 5, PAPER)).join("");
      return ink(d) + stroke(`M${n(CX - h.rx - 10)} ${n(band - 38)}Q${CX} ${n(band - 30)} ${n(CX + h.rx + 10)} ${n(band - 38)}`, 6, PAPER) + ribs;
    }
    case "grad": {
      // The mascot's mortarboard.
      const base = top + 26;
      const crown = `M${CX - 92} ${n(base + 22)}L${CX - 88} ${n(top - 30)}L${CX + 92} ${n(top - 30)}L${CX + 96} ${n(base + 22)}Q${CX} ${n(base - 6)} ${CX - 92} ${n(base + 22)}Z`;
      const board = `M${CX - 176} ${n(top - 36)}L${CX + 6} ${n(top - 92)}L${CX + 186} ${n(top - 32)}L${CX + 4} ${n(top + 10)}Z`;
      const tassel = stroke(`M${CX + 6} ${n(top - 40)}L${CX + 150} ${n(top - 18)}L${CX + 150} ${n(top + 50)}`, 6) +
        `<path d="M${CX + 136} ${n(top + 50)}L${CX + 164} ${n(top + 50)}L${CX + 170} ${n(top + 82)}L${CX + 130} ${n(top + 82)}Z" fill="${INK}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
      return ink(crown) + ink(board) + tassel;
    }
    case "earrings": {
      // Under a hijab or headscarf the ears are covered, and so are earrings.
      if (COVERED.has(s.hair) && s.hair !== "wrap") return "";
      const [x, y] = lobe(4);
      return mirror(`<circle cx="${n(x)}" cy="${n(y + 8)}" r="7" fill="${PAPER}" stroke="${INK}" stroke-width="5"/>`);
    }
    case "hoops": {
      if (COVERED.has(s.hair) && s.hair !== "wrap") return "";
      const [x, y] = lobe(4);
      return mirror(`<circle cx="${n(x)}" cy="${n(y + 20)}" r="16" fill="none" stroke="${INK}" stroke-width="6"/>`);
    }
    case "headphones": {
      const band = arc(h, PI + 0.02, 2 * PI - 0.02, 30, 16);
      const [x] = lobe();
      const cup = `<rect x="${n(x - 12)}" y="${n(c.earY - 40)}" width="40" height="76" rx="18" fill="${INK}"/>`;
      return stroke(smoothOpen(band), 14) + stroke(smoothOpen(arc(h, PI + 0.3, 2 * PI - 0.3, 30, 12)), 4, PAPER) + mirror(stroke(`M${n(x + 8)} ${n(c.earY - 36)}L${pt(band[0])}`, 12) + cup);
    }
    case "pencil": {
      // Tucked behind the right ear (viewer's right), pointing forward and down.
      const ex = SIZE - c.edge(c.earY) + 18;
      const ey = c.earY - 30 * c.earK;
      const body = `M${n(ex - 34)} ${n(ey + 6)}L${n(ex + 56)} ${n(ey - 22)}L${n(ex + 60)} ${n(ey - 8)}L${n(ex - 30)} ${n(ey + 20)}Z`;
      return paper(body, null) + ink(`M${n(ex - 34)} ${n(ey + 6)}L${n(ex - 52)} ${n(ey + 18)}L${n(ex - 30)} ${n(ey + 20)}Z`, false) + stroke(`M${n(ex + 44)} ${n(ey - 18)}L${n(ex + 48)} ${n(ey - 4)}`, 5);
    }
  }
}

/* ───────── assembly ───────── */

/** How far the parts reach past the head's top and sides, for framing. */
const HAIR_REACH: Partial<Record<FaceSpec["hair"], [number, number]>> = {
  afro: [72, 72], curly: [34, 30], bun: [92, 0], spiky: [40, 22], quiff: [52, 16], messy: [30, 26], wavy: [28, 42], bob: [26, 38], bangs: [26, 38], long: [26, 44], longWavy: [30, 48],
  hijab: [40, 82], headscarf: [24, 60], wrap: [36, 34], ponytail: [14, 74], braid: [14, 34], sidePart: [24, 34],
};
const WEAR_REACH: Record<FaceSpec["headwear"], [number, number]> = { none: [0, 0], doppi: [40, 0], cap: [26, 78], beanie: [32, 16], grad: [96, 50], earrings: [0, 0], hoops: [0, 0], headphones: [34, 24], pencil: [0, 36] };

/** The face as an SVG document (deterministic: the same spec gives the same bytes). */
export function renderFace(input: FaceSpec): string {
  const s = FaceSpecSchema.parse(migrateFaceSpec(input));
  const c = anchors(s);
  const { h, top, chin } = c;
  const hair = hairLayers(c);
  const covering = s.hair === "hijab" ? { front: hijab(c) } : s.hair === "headscarf" ? headscarf(c) : s.hair === "wrap" ? { front: wrap(c) } : null;
  const body = [
    covering && "back" in covering ? covering.back : "",
    hair.back ?? "",
    ears(c),
    skin(headPath(h), c.tone),
    headOutline(h),
    details(c),
    facialHair(c, "under"),
    nose(c),
    mouth(c),
    facialHair(c, "over"),
    eyes(c),
    brows(c),
    hair.front ?? "",
    covering?.front ?? "",
    glasses(c),
    headwear(c),
  ].join("");
  // Frame the drawing: the highest part 30 px under the top edge, the widest within the sides.
  const [hairTop, hairSide] = HAIR_REACH[s.hair] ?? [28, 30 * c.earK];
  const [wearTop, wearSide] = WEAR_REACH[s.headwear];
  const reachTop = Math.max(hairTop, wearTop, 20);
  const half = h.rx + Math.max(hairSide, wearSide, 34 * c.earK);
  const bottom = chin + (s.facialHair === "beardLong" ? 80 : s.facialHair === "beardFull" ? 30 : 12);
  const k = Math.min(1.14, (SIZE / 2 - 14) / half, (SIZE - 50) / (bottom - (top - reachTop)));
  const high = top - reachTop;
  const shift = Math.min(259, high + (SIZE / 2 - 30) / k);
  const frame = `translate(${CX} ${SIZE / 2}) scale(${Math.round(k * 1000) / 1000}) translate(${-CX} ${n(-shift)})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${DEFS}<g transform="${frame}">${body}</g></svg>`;
}
