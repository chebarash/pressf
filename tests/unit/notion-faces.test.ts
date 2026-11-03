import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkFace } from "@/core/faces";
import {
  DEFAULT_NOTION_FACE,
  isNotionFace,
  NOTION_FIELDS,
  NOTION_PAINT_ORDER,
  NOTION_ROWS,
  notionCategory,
  notionFacePreviewUrl,
  notionFaceString,
  notionFraming,
  notionLayers,
  notionThumbUrl,
  notionTileTransform,
  parseNotionFace,
  randomNotionFace,
  type NotionFace,
} from "@/core/notion-faces";
import { NOTION_CATEGORIES, NOTION_MARGINS } from "@/core/notion-faces/parts";
import { decodePng, encodePng } from "@/lib/png";
import { composeNotionFace, type PartLoader } from "@/server/notion-faces";

function seeded(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

/** A stand-in part: a 1200×1200 transparent PNG with one opaque grey square (the same square for every part). */
const square = (grey: number) => {
  const data = new Uint8Array(1200 * 1200 * 4);
  for (let y = 400; y < 800; y++)
    for (let x = 400; x < 800; x++) {
      const i = (y * 1200 + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = grey;
      data[i + 3] = 255;
    }
  return encodePng({ width: 1200, height: 1200, data });
};
const GREY: Record<string, number> = { skintone: 10, nose: 40, hair: 70, mouth: 100, eyewear: 130, eyes: 160, accessory: 190, brows: 220 };
const fakeParts = Object.fromEntries(Object.entries(GREY).map(([k, g]) => [k, square(g)]));
const fakeLoader: PartLoader = async (category) => fakeParts[category];

describe("Notion Faces part library", () => {
  it("has Notion's categories in Notion's order, every part with margins and a thumbnail", () => {
    expect(NOTION_CATEGORIES.map((c) => [c.key, c.param])).toEqual([
      ["skintone", "s"],
      ["eyes", "e"],
      ["brows", "b"],
      ["eyewear", "y"],
      ["nose", "n"],
      ["mouth", "m"],
      ["hair", "h"],
      ["accessory", "a"],
    ]);
    const counts = Object.fromEntries(NOTION_CATEGORIES.map((c) => [c.key, c.parts.length]));
    expect(counts).toEqual({ skintone: 6, eyes: 60, brows: 46, eyewear: 26, nose: 68, mouth: 105, hair: 345, accessory: 16 });
    for (const row of NOTION_ROWS) {
      expect(new Set(row.category.parts.map((p) => p.id)).size, row.field).toBe(row.category.parts.length);
      for (const p of row.category.parts) {
        expect(NOTION_MARGINS[row.category.key][p.id], `${row.field} ${p.id}`).toHaveLength(4);
        expect(p.label).toBeTruthy();
        expect(existsSync(join("public", notionThumbUrl(row.field, p.id))), `${row.field} ${p.id} thumbnail`).toBe(true);
      }
    }
    expect(NOTION_ROWS.filter((r) => !r.optional).map((r) => r.field)).toEqual(["skin"]);
    expect(notionTileTransform({ id: 1, label: "x", preview: { scale: 1.6, y: -20, x: 10 } })).toBe("scale(1.6) translateX(10%) translateY(-20%)");
  });

  it("reads and writes Notion's ?face= string", () => {
    const face = parseNotionFace("https://faces.notion.com/?face=s5e37y0b16n7m46h107a0")!;
    expect(face).toEqual(DEFAULT_NOTION_FACE);
    expect(notionFaceString(face)).toBe("s5e37y0b16n7m46h107a0");
    // Notion rewrites the order and drops parts set to none; both read the same.
    expect(parseNotionFace("s3e22m13n1h1a3y7b11")).toEqual({ v: 3, skin: 3, eyes: 22, eyewear: 7, brows: 11, nose: 1, mouth: 13, hair: 1, accessory: 3 });
    expect(parseNotionFace("?face=s3e22n1m13h1&utm=x")).toMatchObject({ eyewear: 0, brows: 0, accessory: 0 });
    expect(parseNotionFace("face=s3e22n1m13h1")).toMatchObject({ skin: 3 });
    expect(parseNotionFace("  s1  ")).toMatchObject({ skin: 1, hair: 0 });
    for (const bad of ["", "hello", "s99e1", "s1h99999", "e22n1", "https://faces.notion.com/", "s1e1;drop"]) expect(parseNotionFace(bad), bad).toBeNull();
    expect(notionFacePreviewUrl(face)).toBe("/admin/face-preview?face=s5e37y0b16n7m46h107a0");
  });

  it("random faces are valid, round-trip through the string and come out like Notion's shuffle", () => {
    const one = Array.from({ length: 400 }, ((r) => () => randomNotionFace(r))(seeded(3)));
    expect(Array.from({ length: 400 }, ((r) => () => randomNotionFace(r))(seeded(3)))).toEqual(one);
    for (const face of one) {
      expect(isNotionFace(face)).toBe(true);
      expect(parseNotionFace(notionFaceString(face))).toEqual(face);
      for (const f of ["skin", "eyes", "brows", "nose", "mouth", "hair"] as const) expect(face[f]).toBeGreaterThan(0);
    }
    const glasses = one.filter((f) => f.eyewear).length / one.length;
    const accessory = one.filter((f) => f.accessory).length / one.length;
    expect(glasses).toBeGreaterThan(0.15);
    expect(glasses).toBeLessThan(0.35);
    expect(accessory).toBeGreaterThan(0.07);
    expect(accessory).toBeLessThan(0.25);
  });

  it("frames the face like Notion's portrait export", () => {
    // Notion: n = 1200 - (350 - 2·min margin), drawn at (ox, ox + oy), ox = (1200 - n)/2, oy = -(top - bottom)·n/2400.
    const face = DEFAULT_NOTION_FACE;
    const m = notionLayers(face).map(([k, id]) => NOTION_MARGINS[k][id]);
    const [top, right, bottom, left] = [0, 1, 2, 3].map((i) => Math.min(...m.map((v) => v[i])));
    const n = 1200 - (350 - 2 * Math.min(top, right, bottom, left));
    const ox = (1200 - n) / 2, oy = (-(top - bottom) * n) / 2400;
    const { x, y, size } = notionFraming(face);
    // The window maps back onto Notion's 1200 canvas: frame point p lands at ox + p·n/1200.
    expect(Math.abs(size * (n / 1200) - 1200)).toBeLessThan(1);
    expect(Math.abs(ox + x * (n / 1200))).toBeLessThan(1);
    expect(Math.abs(ox + oy + y * (n / 1200))).toBeLessThan(1);
  });

  it("paints in Notion's order: each part covers the ones before it", async () => {
    expect(NOTION_PAINT_ORDER).toEqual(["skin", "nose", "hair", "mouth", "eyewear", "eyes", "accessory", "brows"]);
    const full: NotionFace = { v: 3, skin: 1, eyes: 22, eyewear: 7, brows: 11, nose: 1, mouth: 13, hair: 1, accessory: 3 };
    // Take the top part away one at a time: the next one down shows.
    const order = [...NOTION_PAINT_ORDER].reverse();
    for (let i = 0; i < order.length; i++) {
      const face = { ...full };
      for (const f of order.slice(0, i)) if (f !== "skin") face[f] = 0;
      const png = decodePng(await composeNotionFace(face, fakeLoader));
      const { x, y } = notionFraming(face);
      const at = ((600 - y) * png.width + (600 - x)) * 4;
      expect(png.data[at], order[i]).toBe(GREY[notionCategory(order[i]).key]);
      expect(png.data[at + 3]).toBe(255);
      // Transparent around the drawing: no backdrop.
      expect(png.data[3]).toBe(0);
    }
  });

  it("outputs a square transparent PNG that passes the face check", async () => {
    const png = await composeNotionFace(DEFAULT_NOTION_FACE, fakeLoader);
    const check = checkFace(png);
    expect(check).toMatchObject({ ok: true, format: { type: "png", ext: "png" } });
    const { size } = notionFraming(DEFAULT_NOTION_FACE);
    expect(check.ok && check.format.type === "png" && [check.format.width, check.format.height]).toEqual([size, size]);
    // Deterministic: the same face, the same bytes.
    expect(await composeNotionFace(DEFAULT_NOTION_FACE, fakeLoader)).toEqual(png);
  });

  it("the PNG codec round-trips grey and colour pixels", () => {
    const grey = { width: 3, height: 2, data: Uint8Array.from([0, 0, 0, 0, 9, 9, 9, 255, 200, 200, 200, 128, 1, 1, 1, 1, 50, 50, 50, 50, 255, 255, 255, 255]) };
    expect(decodePng(encodePng(grey))).toEqual(grey);
    const colour = { width: 2, height: 2, data: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 1, 0, 0, 0, 0]) };
    expect(decodePng(encodePng(colour))).toEqual(colour);
  });
});

// The real artwork (scripts/notion-faces-sync.ts downloads it to .cache/notion-faces; not in git).
const CACHE = ".cache/notion-faces";
describe.skipIf(!existsSync(CACHE))("Notion Faces parts (local copy)", () => {
  const load: PartLoader = async (category, id) => new Uint8Array(readFileSync(join(CACHE, category, `${id}.png`)));

  it("every part decodes as a 1200×1200 transparent layer", () => {
    for (const row of NOTION_ROWS)
      for (const p of row.category.parts) {
        const img = decodePng(new Uint8Array(readFileSync(join(CACHE, row.category.key, `${p.id}.png`))));
        expect([img.width, img.height], `${row.field} ${p.id}`).toEqual([1200, 1200]);
        let clear = 0;
        for (let i = 3; i < img.data.length; i += 4 * 97) if (!img.data[i]) clear++;
        expect(clear / (img.data.length / (4 * 97)), `${row.field} ${p.id} is a layer, not a backdrop`).toBeGreaterThan(0.2);
      }
  }, 120_000);

  it("random faces compose to PNGs that pass the face check", async () => {
    const random = seeded(11);
    for (let i = 0; i < 6; i++) {
      const face = randomNotionFace(random);
      const png = await composeNotionFace(face, load);
      expect(checkFace(png), notionFaceString(face)).toMatchObject({ ok: true });
    }
    expect(NOTION_FIELDS).toHaveLength(8);
  }, 60_000);
});
