import { describe, expect, it } from "vitest";
import { notionCategory, NOTION_FIELDS, NOTION_ROWS } from "@/core/notion-faces";
import { NOTION_DESCRIPTORS } from "@/core/notion-faces/descriptors";
import {
  candidates,
  deltaE,
  hairColourTag,
  hairStyle,
  mouthKind,
  photoMouthKind,
  rankByDescriptor,
  rankSkin,
  rgbToLab,
  SKIN_ANCHORS,
  suggestFace,
  type PhotoFeatures,
} from "@/core/notion-faces/match";

/** A typical clean-shaven, short-haired face without glasses (the priors' middle). */
const base = (): PhotoFeatures => ({
  skin: [218, 154, 124],
  eyes: { open: 0.27, width: 0.19 },
  brows: { thick: 0.025, arch: 0.13, tilt: 0.13 },
  nose: { width: 0.32, length: 0.345 },
  mouth: { width: 0.46, smile: 0.6, open: 0.05 },
  beard: { chin: 0, jaw: 0, stache: 0, patchy: 0 },
  glasses: { score: 0, dark: 0, frame: 1 },
  hair: { cover: 0.7, top: 0.5, bottom: -0.7, side: 0.3, curl: 0.6, bun: 0, colour: [30, 22, 18], covered: 0, frame: 0 },
});

const close = (a: number[], b: number[], eps = 0.05) => a.every((v, i) => Math.abs(v - b[i]) < eps);

describe("Lab colour", () => {
  it("converts sRGB to CIELAB (D65)", () => {
    expect(close(rgbToLab([255, 255, 255]), [100, 0, 0])).toBe(true);
    expect(close(rgbToLab([0, 0, 0]), [0, 0, 0])).toBe(true);
    expect(close(rgbToLab([255, 0, 0]), [53.24, 80.09, 67.2])).toBe(true);
    expect(close(rgbToLab([0, 0, 255]), [32.3, 79.19, -107.86])).toBe(true);
    expect(close(rgbToLab([119, 119, 119]), [50.03, 0, 0], 0.1)).toBe(true);
  });

  it("measures colour difference as CIE76", () => {
    expect(deltaE([50, 0, 0], [50, 0, 0])).toBe(0);
    expect(deltaE([50, 3, 4], [50, 0, 0])).toBe(5);
  });
});

describe("skin tone", () => {
  it("ranks each anchor's own tone first and all six tones", () => {
    for (const [id, rgb] of Object.entries(SKIN_ANCHORS)) {
      const ranked = rankSkin(rgb);
      expect(ranked[0]).toBe(Number(id));
      expect([...ranked].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it("goes from tone 1 to tone 6 as the skin darkens, and the tones are Notion's ids", () => {
    const tones = [[245, 200, 178], [236, 176, 148], [216, 152, 122], [200, 138, 102], [172, 108, 82], [100, 62, 46]].map((c) => rankSkin(c as [number, number, number])[0]);
    expect(tones).toEqual([1, 2, 3, 4, 5, 6]);
    expect(notionCategory("skin").parts.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("puts the nearest tones next: a colour between two anchors ranks both first", () => {
    const mid = [0, 1, 2].map((k) => Math.round((SKIN_ANCHORS[3][k] + SKIN_ANCHORS[4][k]) / 2)) as [number, number, number];
    expect(rankSkin(mid).slice(0, 2).sort()).toEqual([3, 4]);
  });

  it("reads a black-and-white photo by lightness alone", () => {
    expect(rankSkin([250, 250, 250])[0]).toBe(1);
    expect(rankSkin([60, 60, 60])[0]).toBe(6);
  });
});

describe("hair colour tags", () => {
  it("maps black, brown, blond and grey to Notion's dark, medium and light", () => {
    expect(hairColourTag([20, 16, 15])).toBe("dark");
    expect(hairColourTag([95, 62, 40])).toBe("medium");
    expect(hairColourTag([150, 70, 35])).toBe("medium");
    expect(hairColourTag([200, 165, 120])).toBe("light");
    expect(hairColourTag([150, 150, 150])).toBe("light");
  });
});

describe("descriptor matching", () => {
  const parts = [
    { id: 1, d: { w: 0.1, h: 1 } },
    { id: 2, d: { w: 0.2, h: 1 } },
    { id: 3, d: { w: 0.3, h: 1 } },
    { id: 4, d: { w: 0.4, h: 1 } },
    { id: 5, d: { w: 0.5, h: 1 } },
  ];

  it("ranks by distance between z-scores: wider than most picks the wide parts", () => {
    expect(rankByDescriptor(parts, [{ key: "w", z: 1.4, weight: 1 }])).toEqual([5, 4, 3, 2, 1]);
    expect(rankByDescriptor(parts, [{ key: "w", z: -1.4, weight: 1 }])).toEqual([1, 2, 3, 4, 5]);
    expect(rankByDescriptor(parts, [{ key: "w", z: 0, weight: 1 }])[0]).toBe(3);
  });

  it("weights the terms, and keeps the tile order on ties (a constant descriptor)", () => {
    const two = [
      { id: 10, d: { a: 0, b: 1 } },
      { id: 11, d: { a: 1, b: 0 } },
    ];
    expect(rankByDescriptor(two, [{ key: "a", z: 1, weight: 1 }, { key: "b", z: 1, weight: 0.1 }])[0]).toBe(11);
    expect(rankByDescriptor(two, [{ key: "a", z: 1, weight: 0.1 }, { key: "b", z: 1, weight: 1 }])[0]).toBe(10);
    expect(rankByDescriptor(parts, [{ key: "h", z: 3, weight: 1 }])).toEqual([1, 2, 3, 4, 5]);
    expect(rankByDescriptor([], [{ key: "w", z: 0, weight: 1 }])).toEqual([]);
  });

  it("has descriptors for every part, and never suggests the joke parts", () => {
    for (const row of NOTION_ROWS) {
      const table = NOTION_DESCRIPTORS[row.category.key];
      for (const p of row.category.parts) expect(table[p.id], `${row.field} ${p.id}`).toBeTruthy();
      const offered = candidates(row.field).map((c) => c.id);
      expect(offered.length, row.field).toBeGreaterThan(0);
      for (const id of offered) expect(table[id].novelty, `${row.field} ${id}`).toBeUndefined();
    }
    // The pipe, the donut and the mask are mouths a photo never gives.
    for (const id of [44, 46, 47, 48]) expect(candidates("mouth").map((c) => c.id)).not.toContain(id);
  });

  it("sorts the mouth parts into beards, chin beards, stubble, moustaches and plain mouths", () => {
    const kind = (id: number) => mouthKind(NOTION_DESCRIPTORS.mouth[id]);
    expect([82, 83, 84, 76, 91].map(kind)).toEqual(Array(5).fill("beard"));
    expect([61, 79, 88].map(kind)).toEqual(Array(3).fill("stubble"));
    expect([85, 73, 103].map(kind)).toEqual(Array(3).fill("chin"));
    expect([70, 94, 97, 100].map(kind)).toEqual(Array(4).fill("moustache"));
    expect([1, 2, 13, 27, 46].filter((id) => !NOTION_DESCRIPTORS.mouth[id].novelty).map(kind)).toEqual(Array(4).fill("plain"));
  });

  it("reads the facial hair from the photo's densities", () => {
    expect(photoMouthKind({ chin: 0, jaw: 0, stache: 0, patchy: 0 })).toBe("plain");
    expect(photoMouthKind({ chin: 0.7, jaw: 0.8, stache: 0.2, patchy: 0.1 })).toBe("beard");
    expect(photoMouthKind({ chin: 0.65, jaw: 0.3, stache: 0.5, patchy: 0.2 })).toBe("chin");
    expect(photoMouthKind({ chin: 0.35, jaw: 0.4, stache: 0.1, patchy: 0.9 })).toBe("stubble");
    expect(photoMouthKind({ chin: 0.1, jaw: 0.2, stache: 0.5, patchy: 0.3 })).toBe("moustache");
  });

  it("reads the hair's kind: bald, short, long, or covered", () => {
    expect(hairStyle(base().hair)).toBe("short");
    expect(hairStyle({ ...base().hair, bottom: 0.2 })).toBe("long");
    expect(hairStyle({ ...base().hair, cover: 0.02, bottom: -0.9 })).toBe("none");
    expect(hairStyle({ ...base().hair, covered: 0.9, frame: 0.9 })).toBe("covered");
  });
});

describe("suggestFace", () => {
  const valid = (field: (typeof NOTION_FIELDS)[number], id: number) => id === 0 || notionCategory(field).parts.some((p) => p.id === id);

  it("gives three different, existing parts per category, best first (accessory: none)", () => {
    const s = suggestFace(base());
    for (const field of NOTION_FIELDS) {
      const ids = s[field];
      expect(new Set(ids).size, field).toBe(ids.length);
      for (const id of ids) expect(valid(field, id), `${field} ${id}`).toBe(true);
      if (field !== "accessory") expect(ids, field).toHaveLength(3);
    }
    expect(s.accessory).toEqual([0]);
    expect(s.skin[0]).toBe(3);
    expect(s.eyewear[0]).toBe(0);
    expect(mouthKind(NOTION_DESCRIPTORS.mouth[s.mouth[0]])).toBe("plain");
  });

  it("picks glasses, clear ones unless the lenses are dark", () => {
    const clear = suggestFace({ ...base(), glasses: { score: 0.9, dark: 0, frame: 3 } }).eyewear;
    expect(clear).not.toContain(0);
    for (const id of clear) expect(NOTION_DESCRIPTORS.eyewear[id].dark).toBeLessThan(0.5);
    const shades = suggestFace({ ...base(), glasses: { score: 0.9, dark: 0.9, frame: 3 } }).eyewear;
    for (const id of shades) expect(NOTION_DESCRIPTORS.eyewear[id].dark).toBeGreaterThan(0.6);
  });

  it("picks beard mouths for a bearded photo, a moustache for a moustache", () => {
    const beard = suggestFace({ ...base(), beard: { chin: 0.8, jaw: 0.9, stache: 0.5, patchy: 0.1 } }).mouth;
    expect(beard.map((id) => mouthKind(NOTION_DESCRIPTORS.mouth[id]))).toEqual(["beard", "beard", "beard"]);
    const stache = suggestFace({ ...base(), beard: { chin: 0.05, jaw: 0.1, stache: 0.6, patchy: 0.2 } }).mouth;
    expect(mouthKind(NOTION_DESCRIPTORS.mouth[stache[0]])).toBe("moustache");
  });

  it("matches the hair's Notion tags: long and light, short and dark, a scarf, or none", () => {
    const hair = notionCategory("hair").parts;
    const tags = (id: number) => hair.find((p) => p.id === id)!;
    const long = suggestFace({ ...base(), hair: { ...base().hair, bottom: 0.3, side: 0.5, colour: [205, 170, 125] } }).hair;
    for (const id of long) {
      expect(tags(id).style).toContain("long");
      expect(tags(id).style).not.toContain("covered");
      expect(tags(id).color).toContain("light");
    }
    for (const id of suggestFace(base()).hair) {
      expect(tags(id).style).toContain("short");
      expect(tags(id).color).toContain("dark");
    }
    const scarf = suggestFace({ ...base(), hair: { ...base().hair, covered: 1, frame: 1 } }).hair;
    for (const id of scarf) expect(tags(id).style).toContain("covered");
    // A hijab wraps the face: the first suggestion frames it (Notion's hijab parts), not a cap.
    expect(NOTION_DESCRIPTORS.hair[scarf[0]].frame).toBeGreaterThan(0.6);
    expect(suggestFace({ ...base(), hair: { ...base().hair, cover: 0.01, bottom: -0.9 } }).hair[0]).toBe(0);
  });

  it("follows the measures: a wider mouth and a bigger smile move the pick", () => {
    const pick = (width: number, smile: number) => NOTION_DESCRIPTORS.mouth[suggestFace({ ...base(), mouth: { width, smile, open: 0.05 } }).mouth[0]];
    expect(pick(0.6, 0.6).w).toBeGreaterThan(pick(0.32, 0.6).w);
    expect(pick(0.46, 1).smile).toBeGreaterThan(pick(0.46, 0).smile);
    const brow = (thick: number) => NOTION_DESCRIPTORS.brows[suggestFace({ ...base(), brows: { thick, arch: 0.13, tilt: 0.13 } }).brows[0]];
    expect(brow(0.07).thick).toBeGreaterThan(brow(0.005).thick);
  });
});
