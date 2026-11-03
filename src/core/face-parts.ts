/**
 * The face constructor: a professor's drawn face built from parts, in the
 * Press F line style (heavy black outline, white-filled head with a dotted
 * tone, solid black hair). A FaceSpec is plain JSON; `renderFace` turns it into
 * the same SVG every time, so a saved face can be reopened and edited.
 *
 * Square 480×480 viewBox, transparent background, no scripts, links or images:
 * the output passes `checkFace`. In dark mode the app draws a thin white
 * outline around the head (Face.module.css); nothing here depends on the theme.
 */
import { z } from "zod";

export const FACE_PARTS = {
  head: ["oval", "round", "long", "square", "heart"],
  ears: ["normal", "small", "big"],
  tone: ["dots", "light", "none"],
  hair: ["none", "buzz", "receding", "short", "side", "curly", "long", "bob", "bun", "hijab"],
  facialHair: ["none", "stubble", "moustache", "beardShort", "beardLong"],
  brows: ["straight", "arched", "thick", "raised", "none"],
  eyes: ["dots", "almond", "lidded", "happy"],
  glasses: ["none", "round", "rect"],
  nose: ["line", "hook", "button", "small"],
  mouth: ["neutral", "smile", "grin", "small"],
  headwear: ["none", "doppi", "cap", "beanie", "grad"],
} as const;

export type FacePart = keyof typeof FACE_PARTS;
export type FaceSpec = { [K in FacePart]: (typeof FACE_PARTS)[K][number] };

export const FACE_PART_ORDER = Object.keys(FACE_PARTS) as FacePart[];

export const FACE_PART_LABELS: Record<FacePart, string> = {
  head: "Face shape",
  ears: "Ears",
  tone: "Skin tone dots",
  hair: "Hair",
  facialHair: "Facial hair",
  brows: "Eyebrows",
  eyes: "Eyes",
  glasses: "Glasses",
  nose: "Nose",
  mouth: "Mouth",
  headwear: "Headwear",
};

export const FACE_OPTION_LABELS: { [K in FacePart]: Record<FaceSpec[K], string> } = {
  head: { oval: "Oval", round: "Round", long: "Long", square: "Square", heart: "Heart" },
  ears: { normal: "Normal", small: "Small", big: "Big" },
  tone: { dots: "Dots", light: "Light", none: "None" },
  hair: { none: "Bald", buzz: "Buzz", receding: "Receding", short: "Short", side: "Side part", curly: "Curly", long: "Long", bob: "Bob", bun: "Bun", hijab: "Hijab" },
  facialHair: { none: "None", stubble: "Stubble", moustache: "Moustache", beardShort: "Short beard", beardLong: "Long beard" },
  brows: { straight: "Straight", arched: "Arched", thick: "Thick", raised: "Raised", none: "None" },
  eyes: { dots: "Dots", almond: "Open", lidded: "Lidded", happy: "Happy" },
  glasses: { none: "None", round: "Round", rect: "Rectangular" },
  nose: { line: "Line", hook: "Long", button: "Button", small: "Small" },
  mouth: { neutral: "Neutral", smile: "Smile", grin: "Laugh", small: "Small" },
  headwear: { none: "None", doppi: "Doppi", cap: "Cap", beanie: "Beanie", grad: "Graduation cap" },
};

export const FaceSpecSchema = z.object({
  head: z.enum(FACE_PARTS.head),
  ears: z.enum(FACE_PARTS.ears),
  tone: z.enum(FACE_PARTS.tone),
  hair: z.enum(FACE_PARTS.hair),
  facialHair: z.enum(FACE_PARTS.facialHair),
  brows: z.enum(FACE_PARTS.brows),
  eyes: z.enum(FACE_PARTS.eyes),
  glasses: z.enum(FACE_PARTS.glasses),
  nose: z.enum(FACE_PARTS.nose),
  mouth: z.enum(FACE_PARTS.mouth),
  headwear: z.enum(FACE_PARTS.headwear),
});

export const DEFAULT_FACE_SPEC: FaceSpec = {
  head: "oval",
  ears: "normal",
  tone: "dots",
  hair: "short",
  facialHair: "none",
  brows: "straight",
  eyes: "dots",
  glasses: "none",
  nose: "line",
  mouth: "neutral",
  headwear: "none",
};

/** A stored spec (JSON column) back to a FaceSpec; unknown or missing parts fall back to the default. */
export function parseFaceSpec(value: unknown): FaceSpec | null {
  if (!value || typeof value !== "object") return null;
  const out = { ...DEFAULT_FACE_SPEC } as Record<FacePart, string>;
  for (const part of FACE_PART_ORDER) {
    const v = (value as Record<string, unknown>)[part];
    if (typeof v === "string" && (FACE_PARTS[part] as readonly string[]).includes(v)) out[part] = v;
  }
  return out as FaceSpec;
}

/** A random face from a seeded generator (`random` returns [0, 1)). Rare parts come up less often. */
export function randomFaceSpec(random: () => number = Math.random): FaceSpec {
  const pick = <T>(xs: readonly T[]) => xs[Math.min(xs.length - 1, Math.floor(random() * xs.length))];
  const spec = Object.fromEntries(FACE_PART_ORDER.map((p) => [p, pick(FACE_PARTS[p])])) as FaceSpec;
  // Most professors wear no hat and no glasses half the time; keep randomize believable.
  if (random() < 0.75) spec.headwear = "none";
  if (spec.hair === "hijab" || spec.hair === "long" || spec.hair === "bob" || spec.hair === "bun") {
    spec.facialHair = "none";
    if (spec.headwear !== "grad") spec.headwear = "none";
  }
  if (spec.tone === "none" && random() < 0.6) spec.tone = "dots";
  return spec;
}

/* ───────── geometry ───────── */

const SIZE = 480;
const CX = 240;
const CY = 250;
const INK = "#111111";
const PAPER = "#ffffff";
const OUTLINE = 11;
const LINE = 10;

type Pt = [number, number];
type Shape = { rx: number; ryT: number; ryB: number; taper: number; p: number; sq: number };

const HEADS: Record<FaceSpec["head"], Shape> = {
  oval: { rx: 128, ryT: 150, ryB: 168, taper: 0.22, p: 2, sq: 2 },
  round: { rx: 140, ryT: 146, ryB: 150, taper: 0.08, p: 2, sq: 2 },
  long: { rx: 116, ryT: 156, ryB: 180, taper: 0.18, p: 2, sq: 2 },
  square: { rx: 134, ryT: 148, ryB: 160, taper: 0.2, p: 4, sq: 2.8 },
  heart: { rx: 138, ryT: 148, ryB: 168, taper: 0.42, p: 1.4, sq: 2 },
};

const n = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};
const pt = ([x, y]: Pt) => `${n(x)} ${n(y)}`;

/** A point on the head outline at angle `a` (0 = right, π/2 = chin, 3π/2 = crown), pushed out by `d`. */
function headPoint(h: Shape, a: number, d = 0): Pt {
  const s = Math.sin(a);
  const c = Math.cos(a);
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
/** Several open runs joined by straight segments, closed: corners where runs meet. */
const runs = (...parts: Pt[][]) => parts.map((r, i) => `${i ? "L" : "M"}${pt(r[0])}${through(r)}`).join("") + "Z";

const mirror = (left: string) => `${left}<g transform="matrix(-1 0 0 1 ${SIZE} 0)">${left}</g>`;
const stroke = (d: string, width = LINE, color = INK) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ink = (d: string, outline = true) => `<path d="${d}" fill="${INK}"${outline ? ` stroke="${INK}" stroke-width="${OUTLINE}" stroke-linejoin="round"` : ""}/>`;
/** White shape with an optional dotted tone and the heavy outline. */
const paper = (d: string, tone: string | null, rule = "") =>
  `<path d="${d}" fill="${PAPER}"${rule}/>${tone ? `<path d="${d}" fill="url(#${tone})"${rule}/>` : ""}<path d="${d}" fill="none" stroke="${INK}" stroke-width="${OUTLINE}" stroke-linejoin="round"${rule}/>`;

const DEFS =
  `<defs>` +
  `<pattern id="pf-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.7" fill="${INK}"/><circle cx="9" cy="9" r="1.7" fill="${INK}"/></pattern>` +
  `<pattern id="pf-light" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.5" fill="${INK}"/><circle cx="13" cy="13" r="1.5" fill="${INK}"/></pattern>` +
  `<pattern id="pf-dense" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="${INK}"/><circle cx="6" cy="6" r="2" fill="${INK}"/></pattern>` +
  `<pattern id="pf-stubble" width="15" height="15" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="3.2" fill="${INK}"/><circle cx="11.5" cy="11.5" r="3.2" fill="${INK}"/></pattern>` +
  `</defs>`;

/* ───────── parts ───────── */

type Ctx = { s: FaceSpec; h: Shape; top: number; chin: number; eyeY: number; mouthY: number; tone: string | null };

function ears({ s, h, tone }: Ctx) {
  if (s.hair === "hijab") return "";
  const k = s.ears === "small" ? 0.78 : s.ears === "big" ? 1.22 : 1;
  const x = CX - h.rx + 8;
  const y = CY + 12;
  const d = `M${n(x + 14)} ${n(y - 30 * k)}C${n(x - 30 * k)} ${n(y - 48 * k)} ${n(x - 50 * k)} ${n(y + 20 * k)} ${n(x + 10)} ${n(y + 36 * k)}Z`;
  const inner = `M${n(x - 4)} ${n(y - 12 * k)}C${n(x - 22 * k)} ${n(y - 10 * k)} ${n(x - 22 * k)} ${n(y + 12 * k)} ${n(x - 2)} ${n(y + 14 * k)}`;
  return mirror(paper(d, tone) + stroke(inner, 7));
}

const headPath = (h: Shape) => smoothClosed(arc(h, 0, Math.PI * 2, 0, 48).slice(0, 48));

/** Hair drawn behind the head: long hair, bob, bun, the hijab's drape. */
function hairBack({ s, h, top }: Ctx) {
  const PI = Math.PI;
  if (s.hair === "long" || s.hair === "bob") {
    const bottom = s.hair === "long" ? CY + 205 : CY + 112;
    const w = s.hair === "long" ? 36 : 30;
    const crown = arc(h, PI + 0.1, 2 * PI - 0.1, 24);
    return ink(runs(
      [...crown, [CX + h.rx + w - 8, CY + 60], [CX + h.rx + w, bottom - 12], [CX + h.rx + w - 14, bottom]],
      [[CX - h.rx - w + 14, bottom], [CX - h.rx - w, bottom - 12], [CX - h.rx - w + 8, CY + 60], crown[0]],
    ));
  }
  if (s.hair === "bun") return `<circle cx="${CX}" cy="${n(top - 30)}" r="46" fill="${INK}" stroke="${INK}" stroke-width="${OUTLINE}"/>`;
  return "";
}

function hijabOuter(h: Shape, top: number, chin: number) {
  const r = h.rx + 44;
  return runs(
    [[CX - r - 34, 470], [CX - r - 8, chin - 30], [CX - r, CY - 30], [CX - h.rx * 0.7, top - 22], [CX, top - 36], [CX + h.rx * 0.7, top - 22], [CX + r, CY - 30], [CX + r + 8, chin - 30], [CX + r + 34, 470]],
  );
}

/** The hijab framing the face: the drape with an opening for the face (even-odd). */
function hijabFront({ h, top, chin }: Ctx) {
  const ceiling = CY - h.ryT * 0.55;
  const opening = arc(h, 0, Math.PI * 2, -14, 48).slice(0, 48).map(([x, y]): Pt => [x, Math.max(y, ceiling + Math.abs(x - CX) * 0.25)]);
  return `<path d="${hijabOuter(h, top, chin)}${smoothClosed(opening)}" fill="${INK}" fill-rule="evenodd" stroke="${INK}" stroke-width="${OUTLINE}" stroke-linejoin="round"/>` + stroke(smoothClosed(opening), OUTLINE);
}

function hairFront(c: Ctx) {
  const { s, h } = c;
  const PI = Math.PI;
  const hy = CY - h.ryT * 0.5;
  const L = (d: number, a = PI + 0.14) => headPoint(h, a, d);
  const R = (d: number, a = 2 * PI - 0.14) => headPoint(h, a, d);
  const hairline = (lift = 0): Pt[] => [R(-4), [CX + h.rx * 0.62, hy + 12 - lift], [CX + h.rx * 0.2, hy - lift], [CX - h.rx * 0.3, hy + 2 - lift], [CX - h.rx * 0.66, hy + 12 - lift], L(-4)];
  switch (s.hair) {
    case "short": {
      // A little more volume on the parting side and a soft dip at the middle of the hairline.
      const volume = (a: number) => 12 + 8 * Math.max(0, Math.sin((a - PI) * 1.2));
      const line: Pt[] = [R(-4, 2 * PI - 0.1), [CX + h.rx * 0.7, hy + 16], [CX + h.rx * 0.36, hy - 2], [CX + h.rx * 0.08, hy + 6], [CX - h.rx * 0.22, hy - 4], [CX - h.rx * 0.6, hy + 4], [CX - h.rx * 0.8, hy + 22], L(-4, PI + 0.1)];
      return ink(runs(arc(h, PI + 0.1, 2 * PI - 0.1, volume), line));
    }
    case "bun":
      return ink(runs(arc(h, PI + 0.2, 2 * PI - 0.2, 10), hairline(16)));
    case "buzz": {
      const d = runs(arc(h, PI + 0.12, 2 * PI - 0.12, 4), hairline(-6));
      return `<path d="${d}" fill="${PAPER}"/><path d="${d}" fill="url(#pf-dense)"/>` + stroke(d, OUTLINE);
    }
    case "receding": {
      const side = runs(arc(h, PI - 0.02, PI + 0.72, 6, 8), [[CX - h.rx * 0.62, hy + 6], [CX - h.rx * 0.8, CY - 30], [CX - h.rx + 4, CY - 4]]);
      return mirror(`<path d="${side}" fill="${PAPER}"/><path d="${side}" fill="url(#pf-dense)"/>` + stroke(side, OUTLINE));
    }
    case "side": {
      // Volume on the right, a parting on the left, a flick past the head.
      const volume = (a: number) => 12 + 30 * Math.max(0, Math.sin((a - PI - 0.6) * 1.6));
      const outer = arc(h, PI + 0.14, 2 * PI - 0.06, volume);
      return ink(runs([...outer, [CX + h.rx + 34, CY - h.ryT * 0.45]], [R(-4, 2 * PI - 0.2), [CX + h.rx * 0.5, hy + 18], [CX - h.rx * 0.05, hy - 6], [CX - h.rx * 0.45, hy - 2], [CX - h.rx * 0.7, hy + 14], L(-4)]));
    }
    case "curly": {
      const pts = arc(h, PI - 0.05, 2 * PI + 0.05, 26, 12);
      let d = `M${pt(pts[0])}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const r = Math.hypot(x1 - x0, y1 - y0) * 0.62;
        d += `A${n(r)} ${n(r)} 0 0 1 ${pt(pts[i])}`;
      }
      const inner: Pt[] = [R(-6, 0.02), [CX + h.rx * 0.7, hy + 16], [CX + h.rx * 0.32, hy + 2], [CX - h.rx * 0.12, hy + 10], [CX - h.rx * 0.5, hy + 2], [CX - h.rx * 0.78, hy + 18], L(-6, PI - 0.02)];
      return ink(`${d}L${pt(inner[0])}${through(inner)}Z`);
    }
    case "long":
    case "bob": {
      const down = s.hair === "long" ? 1.0 : 0.62;
      const outer = arc(h, PI - down, 2 * PI + down, 22, 24);
      const bangs = CY - h.ryT * 0.47;
      const right = arc(h, down, -0.12, -22, 6);
      const left = arc(h, PI + 0.12, PI - down, -22, 6);
      const fringe: Pt[] = [[CX + h.rx * 0.62, bangs + 4], [CX + h.rx * 0.2, bangs - 2], [CX - h.rx * 0.25, bangs + 6], [CX - h.rx * 0.62, bangs]];
      return ink(runs(outer, [...right, ...fringe, ...left]));
    }
    default:
      return "";
  }
}

function facialHair({ s, h, mouthY }: Ctx, layer: "under" | "over") {
  if (s.facialHair === "none") return "";
  const PI = Math.PI;
  const toward = (p: Pt, f: number): Pt => [p[0] + (CX - p[0]) * f, p[1] + (mouthY - 12 - p[1]) * f];
  const moustache = `M${n(CX - 38)} ${n(mouthY - 10)}Q${n(CX - 24)} ${n(mouthY - 34)} ${n(CX)} ${n(mouthY - 26)}Q${n(CX + 24)} ${n(mouthY - 34)} ${n(CX + 38)} ${n(mouthY - 10)}Q${n(CX + 18)} ${n(mouthY - 18)} ${n(CX)} ${n(mouthY - 14)}Q${n(CX - 18)} ${n(mouthY - 18)} ${n(CX - 38)} ${n(mouthY - 10)}Z`;
  if (layer === "over") return s.facialHair === "moustache" || s.facialHair === "beardShort" || s.facialHair === "beardLong" ? ink(moustache, false) : "";
  if (s.facialHair === "moustache") return "";
  const from = 0.12;
  const to = PI - 0.12;
  const hang = s.facialHair === "beardLong" ? (a: number) => 70 * Math.pow(Math.max(0, Math.sin(a)), 4) : () => 0;
  const outer = arc(h, from, to, hang, 20);
  const depth = s.facialHair === "stubble" ? 0.34 : 0.42;
  const inner = arc(h, to, from, 0, 20).map((p) => toward(p, depth));
  const band = runs(outer, inner);
  if (s.facialHair === "stubble") return `<path d="${band}" fill="url(#pf-stubble)"/>`;
  return ink(band);
}

function eyes({ s, eyeY }: Ctx) {
  const x = CX - 52;
  const y = eyeY;
  switch (s.eyes) {
    case "dots":
      return mirror(`<ellipse cx="${x}" cy="${y}" rx="9" ry="11" fill="${INK}"/>`);
    case "almond":
      return mirror(`<path d="M${x - 22} ${y}Q${x} ${y - 20} ${x + 22} ${y}Q${x} ${y + 14} ${x - 22} ${y}Z" fill="${PAPER}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/><circle cx="${x + 2}" cy="${y - 2}" r="8" fill="${INK}"/>`);
    case "lidded":
      return mirror(`<ellipse cx="${x + 2}" cy="${y + 3}" rx="9" ry="9" fill="${INK}"/>` + stroke(`M${x - 22} ${y - 2}Q${x} ${y - 14} ${x + 22} ${y - 2}`, 8));
    case "happy":
      return mirror(stroke(`M${x - 18} ${y + 8}Q${x} ${y - 20} ${x + 18} ${y + 8}`, LINE));
  }
}

function brows({ s, eyeY, h }: Ctx) {
  const x = CX - 52;
  const y = eyeY - 36 - (s.brows === "raised" ? 10 : 0);
  if (s.hair === "long" || s.hair === "bob") {
    // Bangs sit low: keep brows just under the fringe.
    const limit = CY - h.ryT * 0.47 + 18;
    if (y < limit) return browShape(s.brows, x, limit);
  }
  return browShape(s.brows, x, y);
}

function browShape(kind: FaceSpec["brows"], x: number, y: number) {
  switch (kind) {
    case "straight":
      return mirror(stroke(`M${x - 24} ${y + 3}L${x + 20} ${y}`, LINE));
    case "arched":
    case "raised":
      return mirror(stroke(`M${x - 24} ${y + 6}Q${x - 4} ${y - 12} ${x + 22} ${y + 2}`, LINE));
    case "thick":
      return mirror(`<path d="M${x - 26} ${y + 6}Q${x - 4} ${y - 14} ${x + 24} ${y - 2}L${x + 22} ${y + 8}Q${x - 2} ${y + 2} ${x - 26} ${y + 6}Z" fill="${INK}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`);
    case "none":
      return "";
  }
}

function nose({ s, eyeY }: Ctx) {
  const y = eyeY;
  switch (s.nose) {
    case "line":
      return stroke(`M${CX + 6} ${y + 6}C${CX - 2} ${y + 34} ${CX - 18} ${y + 58} ${CX - 14} ${y + 68}C${CX - 8} ${y + 76} ${CX + 6} ${y + 72} ${CX + 14} ${y + 66}`);
    case "hook":
      return stroke(`M${CX - 4} ${y + 2}C${CX + 6} ${y + 30} ${CX + 26} ${y + 62} ${CX + 12} ${y + 76}C${CX + 4} ${y + 82} ${CX - 8} ${y + 78} ${CX - 14} ${y + 72}`);
    case "button":
      return stroke(`M${CX - 16} ${y + 56}C${CX - 26} ${y + 76} ${CX + 26} ${y + 76} ${CX + 16} ${y + 56}`);
    case "small":
      return stroke(`M${CX - 2} ${y + 44}Q${CX + 10} ${y + 62} ${CX - 6} ${y + 66}`, 8);
  }
}

function mouth({ s, mouthY }: Ctx) {
  const y = mouthY;
  switch (s.mouth) {
    case "neutral":
      return stroke(`M${CX - 28} ${y}Q${CX} ${y + 5} ${CX + 28} ${y - 1}`);
    case "smile":
      return stroke(`M${CX - 32} ${y - 6}Q${CX} ${y + 20} ${CX + 32} ${y - 6}`);
    case "grin":
      return `<path d="M${CX - 40} ${y - 10}Q${CX} ${y - 2} ${CX + 40} ${y - 10}Q${CX + 34} ${y + 34} ${CX} ${y + 36}Q${CX - 34} ${y + 34} ${CX - 40} ${y - 10}Z" fill="${INK}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`;
    case "small":
      return stroke(`M${CX - 12} ${y + 2}Q${CX} ${y + 8} ${CX + 12} ${y + 2}`, 8);
  }
}

function glasses({ s, eyeY, h }: Ctx) {
  const x = CX - 52;
  const y = eyeY + 2;
  const temple = (edge: number) => stroke(`M${n(edge)} ${y - 6}L${n(CX - h.rx + 6)} ${y - 12}`, 8);
  switch (s.glasses) {
    case "none":
      return "";
    case "round":
      return mirror(`<circle cx="${x}" cy="${y}" r="32" fill="none" stroke="${INK}" stroke-width="${LINE}"/>` + temple(x - 32)) + stroke(`M${CX - 20} ${y - 6}Q${CX} ${y - 16} ${CX + 20} ${y - 6}`, 8);
    case "rect":
      return mirror(`<rect x="${x - 40}" y="${y - 26}" width="80" height="52" rx="9" fill="none" stroke="${INK}" stroke-width="${LINE + 1}"/>` + temple(x - 40)) + stroke(`M${CX - 12} ${y - 10}L${CX + 12} ${y - 10}`, LINE);
  }
}

function headwear({ s, h, top }: Ctx) {
  const PI = Math.PI;
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
  }
}

/** The face as an SVG document (deterministic: the same spec gives the same bytes). */
export function renderFace(input: FaceSpec): string {
  const s = FaceSpecSchema.parse(input);
  const h = HEADS[s.head];
  const top = CY - h.ryT;
  const chin = CY + h.ryB;
  const tone = s.tone === "none" ? null : s.tone === "light" ? "pf-light" : "pf-dots";
  const c: Ctx = { s, h, top, chin, eyeY: CY - 14, mouthY: CY + 92, tone };
  const hijab = s.hair === "hijab";
  const body = [
    hairBack(c),
    ears(c),
    paper(headPath(h), tone),
    hijab ? hijabFront(c) : "",
    facialHair(c, "under"),
    nose(c),
    mouth(c),
    facialHair(c, "over"),
    eyes(c),
    brows(c),
    hijab ? "" : hairFront(c),
    glasses(c),
    headwear(c),
  ].join("");
  // Fill the square like the hand-drawn faces; tall headwear needs headroom.
  const k = s.headwear === "grad" ? 0.98 : s.headwear !== "none" || s.hair === "bun" ? 1.06 : 1.14;
  // Highest point drawn (crown, bun, hats), kept 20 px under the top edge.
  const reach = { none: 0, doppi: 40, cap: 26, beanie: 32, grad: 96 }[s.headwear];
  const high = top - Math.max(reach, s.hair === "bun" ? 82 : s.hair === "curly" ? 42 : 28);
  const shift = Math.min(259, high + (SIZE / 2 - 30) / k);
  const frame = `translate(${CX} ${SIZE / 2}) scale(${k}) translate(${-CX} ${-shift})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${DEFS}<g transform="${frame}">${body}</g></svg>`;
}
