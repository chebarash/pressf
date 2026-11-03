/**
 * Draws a Notion Faces face (src/core/notion-faces) as a PNG, on the server.
 * The parts are Notion's 1200×1200 PNGs, kept in the bucket at
 * faces/notion/<category>/<id>.png (scripts/notion-faces-sync.ts puts them
 * there) or, for local work, in NOTION_FACES_DIR. Drawn in Notion's paint
 * order, framed like Notion's portrait, transparent: the bytes setFace saves.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notionFaceString, notionFraming, notionLayers, type NotionFace } from "@/core/notion-faces";
import { env } from "@/lib/env";
import { crop, decodePng, drawOver, encodePng, type Rgba } from "@/lib/png";
import { getObject } from "@/lib/storage";

export type PartLoader = (category: string, id: number) => Promise<Uint8Array>;

// The parts are small (about 20 MB all told) and never change: keep the bytes once read.
const parts = new Map<string, Promise<Uint8Array>>();

/** A part's PNG bytes, from NOTION_FACES_DIR when set, else the bucket. */
export const loadPart: PartLoader = (category, id) => {
  const key = `${category}/${id}`;
  let hit = parts.get(key);
  if (!hit) {
    const dir = env().NOTION_FACES_DIR;
    hit = (async () => {
      if (dir) return new Uint8Array(await readFile(join(dir, category, `${id}.png`)));
      const object = await getObject(`faces/notion/${key}.png`);
      if (!object) throw new Error(`Face part ${key} is missing from the bucket (run scripts/notion-faces-sync.ts --upload)`);
      return object.body;
    })();
    hit.catch(() => parts.delete(key));
    parts.set(key, hit);
  }
  return hit;
};

/** Composes the face exactly like faces.notion.com and encodes it as a PNG. */
export async function composeNotionFace(face: NotionFace, load: PartLoader = loadPart): Promise<Uint8Array> {
  const layers = notionLayers(face);
  const images = await Promise.all(layers.map(([category, id]) => load(category, id)));
  const canvas: Rgba = { width: 1200, height: 1200, data: new Uint8Array(1200 * 1200 * 4) };
  for (const bytes of images) drawOver(canvas, decodePng(bytes));
  const { x, y, size } = notionFraming(face);
  return encodePng(crop(canvas, x, y, size));
}

// Recent previews, so clicking back and forth in the constructor is instant.
const previews = new Map<string, Promise<Uint8Array>>();
const PREVIEWS_KEPT = 40;

/** composeNotionFace with a small cache of recent faces (the admin preview). */
export function previewNotionFace(face: NotionFace): Promise<Uint8Array> {
  const key = notionFaceString(face);
  let hit = previews.get(key);
  if (hit) {
    previews.delete(key);
  } else {
    hit = composeNotionFace(face);
    hit.catch(() => previews.delete(key));
  }
  previews.set(key, hit);
  while (previews.size > PREVIEWS_KEPT) previews.delete(previews.keys().next().value!);
  return hit;
}
