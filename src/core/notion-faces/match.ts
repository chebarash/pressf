/**
 * "From a photo": picks the closest Notion Faces parts for what was measured
 * on a photo (src/screens/admin/photo-face measures it in the browser; the
 * photo never leaves it). Pure: measurements in, ranked part ids out.
 *
 * Skin tone is the nearest of six real-skin anchors in CIELAB. Hair, glasses
 * and beards first pick a kind (Notion's hair tags; a beard class from the
 * mouth parts' ink), then every category ranks its parts by a weighted
 * distance between the photo's measures and the parts' descriptors
 * (descriptors.ts, measured offline from the part PNGs), both as z-scores:
 * the photo's against typical human proportions (PRIORS), the parts' against
 * the other parts of their category. So "wider than most mouths" picks one of
 * the wider drawn mouths, whatever the drawing's own proportions.
 */
import { NOTION_DESCRIPTORS, type NotionDescriptor } from "./descriptors";
import { notionCategory, type NotionField } from "./index";

/* ───────── colour ───────── */

export type Rgb = [number, number, number];
export type Lab = [number, number, number];

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** sRGB (0–255) to CIELAB, D65 white. */
export function rgbToLab([r, g, b]: Rgb): Lab {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference. */
export const deltaE = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Notion's six skin tones (light to dark; the drawings are greys) as the skin
 * colour a well-lit portrait of that tone measures on the cheeks and forehead
 * (the middle of their lightness), in sRGB. Tuned on public-domain portraits.
 */
export const SKIN_ANCHORS: Record<number, Rgb> = {
  1: [242, 194, 170],
  2: [236, 176, 148],
  3: [218, 154, 124],
  4: [202, 140, 104],
  5: [176, 110, 84],
  6: [116, 72, 52],
};

/**
 * Skin tone ids, nearest first, for a measured skin colour: CIE76 distance in
 * Lab. A black-and-white photo (no colour to compare) goes by lightness only.
 */
export function rankSkin(skin: Rgb): number[] {
  const lab = rgbToLab(skin);
  const grey = Math.hypot(lab[1], lab[2]) < 6;
  return Object.entries(SKIN_ANCHORS)
    .map(([id, rgb]) => {
      const anchor = rgbToLab(rgb);
      return { id: Number(id), d: grey ? Math.abs(lab[0] - anchor[0]) : deltaE(lab, anchor) };
    })
    .sort((a, b) => a.d - b.d)
    .map((x) => x.id);
}

/** Notion's hair colour tag for a measured hair colour (L* of the hair pixels). */
export function hairColourTag(hair: Rgb): "dark" | "medium" | "light" {
  const [L, a, b] = rgbToLab(hair);
  const chroma = Math.hypot(a, b);
  // Grey and white hair and blond read as Notion's light (outline) hair; brown and red as medium.
  if (L >= 48 || (L >= 40 && chroma < 8)) return "light";
  if (L >= 28 || chroma >= 18) return "medium";
  return "dark";
}

/* ───────── what the photo measured ───────── */

/**
 * The photo's measures. Lengths are in face widths (cheek to cheek, landmarks
 * 234–454); scores are 0–1. Anything the photo couldn't show is left out.
 */
export type PhotoFeatures = {
  skin: Rgb;
  eyes: { open: number; width: number };
  brows: { thick: number; arch: number; tilt: number };
  nose: { width: number; length: number };
  mouth: { width: number; smile: number; open: number };
  /** Dark-pixel densities against the skin: chin and jaw, upper lip, and how spotty (stubble) it is. */
  beard: { chin: number; jaw: number; stache: number; patchy: number };
  /** Glasses: how sure (0.5 = two of the three cues agree), dark lenses, and frame = edge strength (bold frames high). */
  glasses: { score: number; dark: number; frame: number };
  hair: {
    /** Share of the scalp (above the forehead) the hair covers. */
    cover: number;
    /** Above the forehead, below the chin (negative: above it), and beyond the cheeks, in face widths. */
    top: number;
    bottom: number;
    side: number;
    curl: number;
    bun: number;
    colour: Rgb;
    /** A scarf round the face (hijab): covered = the head is covered; frame = neck, ears and jaw are wrapped. */
    covered: number;
    frame: number;
  };
};

/* ───────── ranking ───────── */

/** Typical human values of the photo's measures (mean, spread), for its z-scores. Rough, tuned on test photos. */
export const PRIORS = {
  eyeOpen: [0.27, 0.05],
  eyeWidth: [0.19, 0.015],
  browThick: [0.025, 0.015],
  browArch: [0.13, 0.02],
  browTilt: [0.13, 0.04],
  noseWidth: [0.32, 0.025],
  noseLength: [0.345, 0.02],
  mouthWidth: [0.46, 0.05],
  mouthSmile: [0.6, 0.35],
  hairTop: [0.5, 0.12],
  hairSide: [0.4, 0.2],
  hairBottom: [-0.5, 0.4],
  hairCurl: [0.9, 0.4],
  glassesFrame: [2.2, 0.9],
} as const satisfies Record<string, readonly [number, number]>;

/** A measure's z-score against PRIORS, held to ±2.5 (one odd measure shouldn't pick a caricature). */
const zPhoto = (v: number, [mean, sd]: readonly [number, number]) => Math.max(-2.5, Math.min(2.5, (v - mean) / sd));

type Term = { key: string; z: number; weight: number };

const KEY: Record<NotionField, string> = { skin: "skintone", eyes: "eyes", eyewear: "eyewear", brows: "brows", nose: "nose", mouth: "mouth", hair: "hair", accessory: "accessory" };

/** The parts of a category a photo may suggest (not the joke parts), with their descriptors. */
export function candidates(field: NotionField, descriptors = NOTION_DESCRIPTORS): { id: number; d: NotionDescriptor }[] {
  const table = descriptors[KEY[field]] ?? {};
  return notionCategory(field)
    .parts.filter((p) => table[p.id] && !table[p.id].novelty)
    .map((p) => ({ id: p.id, d: table[p.id] }));
}

/**
 * Ranks parts by the weighted squared distance between the photo's z-scores
 * and the parts' (each descriptor standardised over the given parts). Ties
 * keep Notion's tile order. Pure; the core of every category.
 */
export function rankByDescriptor(parts: { id: number; d: NotionDescriptor }[], terms: Term[]): number[] {
  if (!parts.length) return [];
  const stats = new Map<string, [number, number]>();
  for (const { key } of terms) {
    const vals = parts.map((p) => p.d[key] ?? 0);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1;
    stats.set(key, [mean, sd]);
  }
  return parts
    .map((p, order) => {
      let dist = 0;
      for (const t of terms) {
        const [mean, sd] = stats.get(t.key)!;
        dist += t.weight * (t.z - ((p.d[t.key] ?? 0) - mean) / sd) ** 2;
      }
      return { id: p.id, dist, order };
    })
    .sort((a, b) => a.dist - b.dist || a.order - b.order)
    .map((x) => x.id);
}

/** The mouth parts' kind, from their ink: a full beard, a chin beard (goatee, chinstrap), stubble, a moustache, or a plain mouth. */
export type MouthKind = "beard" | "chin" | "stubble" | "moustache" | "plain";
export function mouthKind(d: NotionDescriptor): MouthKind {
  if ((d.beard ?? 0) >= 0.07) return "beard";
  if ((d.blobs ?? 1) >= 10) return "stubble";
  if ((d.beard ?? 0) >= 0.015) return "chin";
  if ((d.stache ?? 0) >= 0.004 && (d.blobs ?? 1) >= 2) return "moustache";
  return "plain";
}

/** The facial hair a photo shows, from the dark-pixel densities in the beard regions. */
export function photoMouthKind(b: PhotoFeatures["beard"]): MouthKind {
  const most = Math.max(b.chin, b.jaw);
  // Stubble: some of the chin and jaw, only a little darker than the skin.
  if (most >= 0.25 && most < 0.5 && b.patchy >= 0.7) return "stubble";
  if (b.chin >= 0.4 && b.jaw >= 0.45) return "beard";
  if (b.chin >= 0.4) return "chin";
  if (b.stache >= 0.35) return "moustache";
  return "plain";
}

/** Notion's hair style tag, and whether the hair is gone (bald: hair none). */
export function hairStyle(h: PhotoFeatures["hair"]): "covered" | "long" | "short" | "none" {
  if (h.covered >= 0.5) return "covered";
  if (h.cover < 0.08 && h.bottom < -0.6) return "none";
  return h.bottom > -0.25 ? "long" : "short";
}

const top = (ids: number[], n = 3) => [...new Set(ids)].slice(0, n);

export type Suggestions = Record<NotionField, number[]>;

/** The top three parts per category for a photo's measures (0 = none), best first. */
export function suggestFace(f: PhotoFeatures, descriptors = NOTION_DESCRIPTORS): Suggestions {
  const rank = (field: NotionField, terms: Term[], keep?: (d: NotionDescriptor) => boolean) =>
    rankByDescriptor(candidates(field, descriptors).filter((p) => !keep || keep(p.d)), terms);

  const eyes = rank("eyes", [
    { key: "open", z: zPhoto(f.eyes.open, PRIORS.eyeOpen), weight: 1 },
    { key: "ew", z: zPhoto(f.eyes.width, PRIORS.eyeWidth), weight: 0.4 },
  ]);

  const brows = rank("brows", [
    { key: "thick", z: zPhoto(f.brows.thick, PRIORS.browThick), weight: 1 },
    { key: "arch", z: zPhoto(f.brows.arch, PRIORS.browArch), weight: 0.6 },
    { key: "tilt", z: zPhoto(f.brows.tilt, PRIORS.browTilt), weight: 0.3 },
  ]);

  const nose = rank("nose", [
    { key: "w", z: zPhoto(f.nose.width, PRIORS.noseWidth), weight: 1 },
    { key: "h", z: zPhoto(f.nose.length, PRIORS.noseLength), weight: 0.4 },
  ]);

  // Mouths: the facial hair decides the kind, then width and smile the part.
  const kind = photoMouthKind(f.beard);
  const mouthTerms: Term[] =
    kind === "plain" || kind === "moustache"
      ? [
          { key: "w", z: zPhoto(f.mouth.width, PRIORS.mouthWidth), weight: 1 },
          { key: "smile", z: zPhoto(f.mouth.smile, PRIORS.mouthSmile), weight: 1 },
        ]
      : [
          { key: "beard", z: (Math.max(f.beard.chin, f.beard.jaw) - 0.5) / 0.2, weight: 1 },
          { key: "smile", z: zPhoto(f.mouth.smile, PRIORS.mouthSmile), weight: 0.4 },
        ];
  let mouth = rank("mouth", mouthTerms, (d) => mouthKind(d) === kind);
  if (mouth.length < 3) mouth = [...mouth, ...rank("mouth", mouthTerms, (d) => mouthKind(d) === "plain")];

  // Glasses: none unless the photo shows them; then clear or dark lenses (the parts' ink darkness), bold or fine frames (ink area).
  const glassesTerms: Term[] = [
    { key: "dark", z: f.glasses.dark >= 0.5 ? 1.5 : -0.8, weight: 1 },
    { key: "area", z: zPhoto(f.glasses.frame, PRIORS.glassesFrame), weight: 0.5 },
  ];
  const eyewear = f.glasses.score >= 0.5 ? rank("eyewear", glassesTerms) : [0, ...rank("eyewear", glassesTerms)];

  // Hair: Notion's style and colour tags first, then the shape.
  const style = hairStyle(f.hair);
  const colour = hairColourTag(f.hair.colour);
  // A scarf: how much it wraps the face decides (a hijab, not a cap); the hair's shape doesn't show.
  const hairTerms: Term[] =
    style === "covered"
      ? [
          { key: "frame", z: (f.hair.frame - 0.5) / 0.25, weight: 2 },
          { key: "bottom", z: 1, weight: 0.5 },
          { key: "side", z: -0.5, weight: 0.3 },
        ]
      : [
          { key: "top", z: zPhoto(f.hair.top, PRIORS.hairTop), weight: 0.8 },
          { key: "side", z: zPhoto(f.hair.side, PRIORS.hairSide), weight: 1 },
          { key: "bottom", z: zPhoto(f.hair.bottom, PRIORS.hairBottom), weight: style === "long" ? 0.6 : 0.4 },
          { key: "curl", z: zPhoto(f.hair.curl, PRIORS.hairCurl), weight: 0.7 },
          { key: "bun", z: f.hair.bun >= 0.5 ? 3 : -0.3, weight: 0.7 },
        ];
  const hairParts = notionCategory("hair").parts;
  const tagged = (styleTag: string, colourTag: string | null) => {
    const ids = new Set(hairParts.filter((p) => p.style?.includes(styleTag) && (!colourTag || p.color?.includes(colourTag))).map((p) => p.id));
    // Covered parts carry "short"/"long" too (what shows under the scarf); bare hair never shows a covered one.
    return (d: NotionDescriptor, id: number) => ids.has(id) && (styleTag === "covered" || !hairParts.find((p) => p.id === id)?.style?.includes("covered")) && !d.novelty;
  };
  const rankHair = (styleTag: string, colourTag: string | null) => {
    const keep = tagged(styleTag, colourTag);
    return rankByDescriptor(candidates("hair", descriptors).filter((p) => keep(p.d, p.id)), hairTerms);
  };
  let hair: number[];
  if (style === "none") hair = [0, ...rankHair("short", colour)];
  else {
    hair = rankHair(style, colour);
    if (hair.length < 3) hair = [...hair, ...rankHair(style, null)];
  }

  return {
    skin: top(rankSkin(f.skin)),
    eyes: top(eyes),
    eyewear: top(eyewear),
    brows: top(brows),
    nose: top(nose),
    mouth: top(mouth),
    hair: top(hair),
    // Nothing on a photo maps to Notion's accessories (ears, candles, a graduation cap…).
    accessory: [0],
  };
}
