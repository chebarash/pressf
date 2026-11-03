import { describe, expect, it } from "vitest";
import { DEFAULT_FACE_SPEC, FACE_OPTION_LABELS, FACE_PART_LABELS, FACE_PART_ORDER, FACE_PARTS, FaceSpecSchema, LEGACY_OPTIONS, migrateFaceSpec, parseFaceSpec, randomFaceSpec, renderFace, type FaceSpec } from "@/core/face-parts";
import { parsePastedFaceSpec } from "@/core/face-paste";
import { checkFace } from "@/core/faces";

const bytes = (svg: string) => new TextEncoder().encode(svg);

/** A small seeded generator so random faces are reproducible. */
function seeded(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

describe("face constructor", () => {
  it("draws the same SVG for the same spec, square and transparent", () => {
    const a = renderFace(DEFAULT_FACE_SPEC);
    expect(renderFace({ ...DEFAULT_FACE_SPEC })).toBe(a);
    expect(a).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 480 480"/);
    // No backdrop: nothing paints the full square.
    expect(a).not.toMatch(/<rect[^>]*width="480"/);
    expect(checkFace(bytes(a))).toMatchObject({ ok: true, format: { type: "svg" } });
  });

  it("renders every option of every part as a valid, distinct face", () => {
    for (const part of FACE_PART_ORDER) {
      const seen = new Set<string>();
      for (const value of FACE_PARTS[part]) {
        const svg = renderFace({ ...DEFAULT_FACE_SPEC, [part]: value } as FaceSpec);
        expect(checkFace(bytes(svg)), `${part}=${value}`).toMatchObject({ ok: true });
        expect(svg).not.toMatch(/NaN|undefined|Infinity/);
        seen.add(svg);
      }
      expect(seen.size, part).toBe(FACE_PARTS[part].length);
    }
  });

  it("random faces are valid and reproducible from a seed", () => {
    const one = Array.from({ length: 40 }, ((r) => () => randomFaceSpec(r))(seeded(7)));
    const two = Array.from({ length: 40 }, ((r) => () => randomFaceSpec(r))(seeded(7)));
    expect(one).toEqual(two);
    for (const spec of one) expect(checkFace(bytes(renderFace(spec)))).toMatchObject({ ok: true });
  });

  it("has the variety the constructor promises, every option labelled", () => {
    const min: Partial<Record<keyof FaceSpec, number>> = { head: 6, hair: 20, eyes: 8, brows: 6, nose: 6, mouth: 10, facialHair: 9, glasses: 6, headwear: 9, details: 5 };
    for (const [part, count] of Object.entries(min)) expect(FACE_PARTS[part as keyof FaceSpec].length, part).toBeGreaterThanOrEqual(count);
    for (const hair of ["none", "receding", "buzz", "short", "curly", "wavy", "long", "ponytail", "bun", "afro", "sidePart", "hijab", "headscarf"]) expect(FACE_PARTS.hair).toContain(hair);
    for (const wear of ["earrings", "doppi", "cap", "beanie", "grad", "headphones"]) expect(FACE_PARTS.headwear).toContain(wear);
    for (const detail of ["freckles", "wrinkles", "mole", "blush"]) expect(FACE_PARTS.details).toContain(detail);
    for (const part of FACE_PART_ORDER) {
      expect(FACE_PART_LABELS[part]).toBeTruthy();
      for (const value of FACE_PARTS[part]) expect((FACE_OPTION_LABELS[part] as Record<string, string>)[value], `${part}=${value}`).toBeTruthy();
    }
  });

  it("draws every option over every face shape and hair colour", () => {
    for (const head of FACE_PARTS.head)
      for (const hairColor of FACE_PARTS.hairColor)
        for (const part of FACE_PART_ORDER)
          for (const value of FACE_PARTS[part]) {
            const svg = renderFace({ ...DEFAULT_FACE_SPEC, head, hairColor, [part]: value } as FaceSpec);
            expect(svg, `${head}/${hairColor}/${part}=${value}`).not.toMatch(/NaN|undefined|Infinity/);
            expect(svg.length).toBeLessThan(120_000);
          }
  });

  it("maps specs saved by the first constructor to the new parts", () => {
    const legacy = { head: "square", ears: "big", tone: "light", hair: "side", facialHair: "beardShort", brows: "thick", eyes: "dots", glasses: "rect", nose: "hook", mouth: "grin", headwear: "doppi" };
    const spec = parseFaceSpec(legacy)!;
    expect(spec).toEqual({ ...legacy, hair: "sidePart", eyes: "dot", nose: "long", hairColor: "black", details: "none" });
    expect(FaceSpecSchema.safeParse(migrateFaceSpec(legacy)).success).toBe(true);
    expect(parseFaceSpec({ ...legacy, eyes: "almond" })!.eyes).toBe("open");
    // Every mapping points at a real option.
    for (const [part, map] of Object.entries(LEGACY_OPTIONS)) for (const to of Object.values(map)) expect(FACE_PARTS[part as keyof FaceSpec]).toContain(to);
    // A stored old spec draws like its migrated form.
    expect(renderFace(legacy as unknown as FaceSpec)).toBe(renderFace(spec));
  });

  it("rejects unknown parts and reads stored specs leniently", () => {
    expect(() => renderFace({ ...DEFAULT_FACE_SPEC, hair: "mohawk" } as unknown as FaceSpec)).toThrow();
    expect(parseFaceSpec(null)).toBeNull();
    expect(parseFaceSpec({ hair: "curly", glasses: "monocle" })).toEqual({ ...DEFAULT_FACE_SPEC, hair: "curly" });
  });
});

describe("pasting a face spec", () => {
  const other = <K extends keyof FaceSpec>(part: K) => FACE_PARTS[part].find((v) => v !== DEFAULT_FACE_SPEC[part]) as FaceSpec[K];

  it("fills the given parts and keeps the rest of the current face", () => {
    const current = { ...DEFAULT_FACE_SPEC, glasses: other("glasses") };
    const r = parsePastedFaceSpec(JSON.stringify({ hair: other("hair"), mouth: other("mouth") }), current);
    expect(r).toEqual({ ok: true, spec: { ...current, hair: other("hair"), mouth: other("mouth") }, filled: ["hair", "mouth"] });
    if (r.ok) expect(checkFace(bytes(renderFace(r.spec)))).toMatchObject({ ok: true });
  });

  it("takes a full spec, or one wrapped in { spec }", () => {
    const full = { ...DEFAULT_FACE_SPEC, hair: other("hair") };
    expect(parsePastedFaceSpec(JSON.stringify(full), DEFAULT_FACE_SPEC)).toMatchObject({ ok: true, spec: full });
    expect(parsePastedFaceSpec(`  ${JSON.stringify({ spec: full, note: "clear photo" })}\n`, DEFAULT_FACE_SPEC)).toMatchObject({ ok: true, spec: full });
  });

  it("refuses anything that isn't a spec of known parts and options", () => {
    const fail = (text: string) => {
      const r = parsePastedFaceSpec(text, DEFAULT_FACE_SPEC);
      expect(r.ok, text).toBe(false);
      return r.ok ? "" : r.error;
    };
    expect(fail("")).toMatch(/Paste/);
    expect(fail("{hair: short}")).toMatch(/JSON/);
    expect(fail("[1, 2]")).toMatch(/object/);
    expect(fail('"short"')).toMatch(/object/);
    expect(fail("{}")).toMatch(/no parts/);
    expect(fail('{"hair": "mohawk"}')).toMatch(/hair can't be "mohawk": use /);
    expect(fail('{"glasses": 1}')).toMatch(/glasses/);
    expect(fail('{"hairr": "short", "colour": "red"}')).toMatch(/Unknown parts: hairr, colour/);
    expect(fail(JSON.stringify({ hair: "short", pad: "x".repeat(5000) }))).toMatch(/too long/);
  });
});
