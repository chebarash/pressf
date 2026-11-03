import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FACE_SPEC, FACE_PART_ORDER, FACE_PARTS, parseFaceSpec, randomFaceSpec, renderFace, type FaceSpec } from "@/core/face-parts";
import { checkFace } from "@/core/faces";
import { describeFace, photoType, PhotoFaceError } from "@/lib/face-photo";

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

  it("rejects unknown parts and reads stored specs leniently", () => {
    expect(() => renderFace({ ...DEFAULT_FACE_SPEC, hair: "mohawk" } as unknown as FaceSpec)).toThrow();
    expect(parseFaceSpec(null)).toBeNull();
    expect(parseFaceSpec({ hair: "curly", glasses: "monocle" })).toEqual({ ...DEFAULT_FACE_SPEC, hair: "curly" });
  });
});

describe("face from a photo", () => {
  it("knows images by their bytes", () => {
    expect(photoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(photoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe("image/png");
    expect(photoType(new Uint8Array([...bytes("RIFF"), 0, 0, 0, 0, ...bytes("WEBP")]))).toBe("image/webp");
    expect(photoType(bytes("%PDF-1.7 hello world"))).toBeNull();
    expect(photoType(bytes("<svg></svg> padding"))).toBeNull();
  });

  const client = (parse: (...args: unknown[]) => unknown) => ({ beta: { messages: { parse: vi.fn(parse) } } }) as unknown as Anthropic;
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

  it("asks for parts only, with the photo inline and nothing else about the person", async () => {
    const { tone: _tone, ...parts } = DEFAULT_FACE_SPEC;
    const c = client(async () => ({ stop_reason: "end_turn", parsed_output: { spec: { ...parts, hair: "bun" }, note: "Clear photo." } }));
    const out = await describeFace(jpeg, "image/jpeg", c);
    expect(out.spec.hair).toBe("bun");
    const req = (c.beta.messages.parse as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown> & { system: string; messages: Array<{ content: Array<{ type: string; source?: { data: string } }> }> };
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.system).toMatch(/Never infer or mention identity/);
    expect(req.messages[0].content[0]).toMatchObject({ type: "image", source: { media_type: "image/jpeg", data: Buffer.from(jpeg).toString("base64") } });
  });

  it("turns API failures into a message for the admin", async () => {
    const credit = client(async () => {
      throw new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }, "Your credit balance is too low to access the Anthropic API.", new Headers());
    });
    await expect(describeFace(jpeg, "image/jpeg", credit)).rejects.toThrow(/out of credit/);
    await expect(describeFace(jpeg, "image/jpeg", credit)).rejects.toBeInstanceOf(PhotoFaceError);
    const refused = client(async () => ({ stop_reason: "refusal", parsed_output: null }));
    await expect(describeFace(jpeg, "image/jpeg", refused)).rejects.toThrow(/by hand/);
    const offline = client(async () => {
      throw new Anthropic.APIConnectionError({ message: "fetch failed" });
    });
    await expect(describeFace(jpeg, "image/jpeg", offline)).rejects.toThrow(/by hand/);
  });
});
