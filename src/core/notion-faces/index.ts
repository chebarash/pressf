/**
 * Faces built from the Notion Faces part library (faces.notion.com; the owner
 * confirmed the use is agreed, 2026-11-04). A face is Notion's own parameters,
 * one part id per category (0 = none), and is composed exactly like Notion
 * does: every part is a 1200×1200 transparent PNG drawn at 0,0 in Notion's
 * paint order, then framed with Notion's portrait framing (the margins table).
 * Pure: shared by the server renderer and the admin constructor.
 */
import { z } from "zod";
import { NOTION_CATEGORIES, NOTION_MARGINS, NOTION_TAGS, type NotionCategory, type NotionPart } from "./parts";

export { NOTION_TAGS };

/** The spec fields, in the order Notion writes its `?face=` string (s e y b n m h a). */
export const NOTION_FIELDS = ["skin", "eyes", "eyewear", "brows", "nose", "mouth", "hair", "accessory"] as const;
export type NotionField = (typeof NOTION_FIELDS)[number];
/** FaceSpec v3: Notion's parameters. Stored in faces.spec; `v: 3` tells it from the drawn v2 specs. */
export type NotionFace = { v: 3 } & Record<NotionField, number>;

const CATEGORY_KEY: Record<NotionField, string> = { skin: "skintone", eyes: "eyes", eyewear: "eyewear", brows: "brows", nose: "nose", mouth: "mouth", hair: "hair", accessory: "accessory" };
const byKey = new Map(NOTION_CATEGORIES.map((c) => [c.key, c]));
export const notionCategory = (field: NotionField): NotionCategory => byKey.get(CATEGORY_KEY[field])!;

/**
 * Notion's paint order (its canvas draws the layers in this order; checked
 * pixel for pixel against faces.notion.com): later parts cover earlier ones,
 * so brows sit over hair and glasses, and hats (hair) under glasses.
 */
export const NOTION_PAINT_ORDER: readonly NotionField[] = ["skin", "nose", "hair", "mouth", "eyewear", "eyes", "accessory", "brows"];

/** The constructor's rows: Notion's sidebar order and labels. */
export const NOTION_ROWS: { field: NotionField; category: NotionCategory; optional: boolean }[] = NOTION_CATEGORIES.map((category) => {
  const field = (Object.keys(CATEGORY_KEY) as NotionField[]).find((f) => CATEGORY_KEY[f] === category.key)!;
  // Every category but skin tone has a "none" tile on Notion.
  return { field, category, optional: field !== "skin" };
});

const ids = (field: NotionField) => new Set(notionCategory(field).parts.map((p) => p.id));
const IDS = Object.fromEntries(NOTION_FIELDS.map((f) => [f, ids(f)])) as Record<NotionField, Set<number>>;

export const NotionFaceSchema = z.object({
  v: z.literal(3),
  ...(Object.fromEntries(
    NOTION_FIELDS.map((f) => [f, z.number().int().refine((id) => (f === "skin" ? IDS[f].has(id) : id === 0 || IDS[f].has(id)), `Unknown ${f} part`)]),
  ) as unknown as Record<NotionField, z.ZodType<number>>),
});

export const isNotionFace = (value: unknown): value is NotionFace => NotionFaceSchema.safeParse(value).success;

/** The face on Notion's start page; the constructor opens on it. */
export const DEFAULT_NOTION_FACE: NotionFace = { v: 3, skin: 5, eyes: 37, eyewear: 0, brows: 16, nose: 7, mouth: 46, hair: 107, accessory: 0 };

/** Notion's `?face=` string: each field's letter and id, e.g. s5e37y0b16n7m46h107a0. */
export function notionFaceString(face: NotionFace): string {
  return NOTION_FIELDS.map((f) => `${notionCategory(f).param}${face[f]}`).join("");
}

/**
 * Reads a face from a Notion Faces link, a `?face=` query or the bare string
 * (letters and ids in any order, like Notion's own parser). Missing parts are
 * none; null when it isn't a face or names parts that don't exist.
 */
export function parseNotionFace(input: string): NotionFace | null {
  let text = input.trim();
  const query = text.match(/(?:^|[?&])face=([^&#\s]*)/);
  if (query) text = decodeURIComponent(query[1]);
  if (!/^(?:[a-z]\d+)+$/i.test(text)) return null;
  const byParam = new Map(NOTION_FIELDS.map((f) => [notionCategory(f).param, f]));
  const face: NotionFace = { v: 3, skin: 0, eyes: 0, eyewear: 0, brows: 0, nose: 0, mouth: 0, hair: 0, accessory: 0 };
  for (const [, letter, id] of text.matchAll(/([a-z])(\d+)/gi)) {
    const field = byParam.get(letter.toLowerCase());
    if (field) face[field] = parseInt(id, 10);
  }
  return isNotionFace(face) ? face : null;
}

/**
 * A random face the way Notion's shuffle makes one: any skin, eyes, brows,
 * nose, mouth and hair; glasses one time in four, an accessory one in seven.
 */
export function randomNotionFace(random: () => number = Math.random): NotionFace {
  const pick = (f: NotionField) => {
    const parts = notionCategory(f).parts;
    return parts[Math.floor(random() * parts.length)].id;
  };
  const chance = (pct: number) => random() < pct / 100;
  const skin = pick("skin"), eyes = pick("eyes");
  const eyewear = chance(25) ? pick("eyewear") : 0;
  const brows = pick("brows"), nose = pick("nose"), mouth = pick("mouth"), hair = pick("hair");
  const accessory = chance(15) ? pick("accessory") : 0;
  return { v: 3, skin, eyes, eyewear, brows, nose, mouth, hair, accessory };
}

/** The layers to draw, bottom first: [category key, part id]. */
export function notionLayers(face: NotionFace): [string, number][] {
  return NOTION_PAINT_ORDER.filter((f) => face[f]).map((f) => [CATEGORY_KEY[f], face[f]]);
}

/**
 * Notion's portrait framing: the face is scaled so the closest drawing edge
 * keeps a margin, centred across and shifted to balance top and bottom.
 * Returned as the square window of the 1200×1200 frame that becomes the image
 * (the same picture at the parts' own resolution, without resampling).
 */
export function notionFraming(face: NotionFace): { x: number; y: number; size: number } {
  const m = notionLayers(face).map(([key, id]) => NOTION_MARGINS[key]?.[id]).filter(Boolean);
  if (!m.length) return { x: 0, y: 0, size: 1200 };
  const top = Math.min(...m.map((v) => v[0])), right = Math.min(...m.map((v) => v[1])), bottom = Math.min(...m.map((v) => v[2])), left = Math.min(...m.map((v) => v[3]));
  const min = Math.min(top, right, bottom, left);
  // As on Notion: drawn at n px in a 1200 canvas, offset (ox, ox + oy).
  const n = 1200 - (350 - 2 * min);
  const ox = (1200 - n) / 2;
  const oy = -(((top - bottom) * n) / 1200 / 2);
  const s = n / 1200;
  return { x: Math.round(-ox / s), y: Math.round(-(ox + oy) / s), size: Math.round(1200 / s) };
}

/** A part's small tile image (public/notion-faces, written by scripts/notion-faces-sync.ts). */
export const notionThumbUrl = (field: NotionField, id: number) => `/notion-faces/${CATEGORY_KEY[field]}/${id}.png`;

/** Notion's CSS for a part's tile: zoom on the part (scale, then shift in %). */
export function notionTileTransform(part: NotionPart): string | undefined {
  const p = part.preview;
  if (!p) return undefined;
  const t = [p.scale ? `scale(${p.scale})` : "", p.x ? `translateX(${p.x}%)` : "", p.y ? `translateY(${p.y}%)` : ""].filter(Boolean);
  return t.length ? t.join(" ") : undefined;
}

/**
 * The composed face as an image URL, for the browser (admins only; the server
 * draws it from the parts). Same parameters, same picture as the saved face.
 */
export const notionFacePreviewUrl = (face: NotionFace) => `/admin/face-preview?face=${notionFaceString(face)}`;
