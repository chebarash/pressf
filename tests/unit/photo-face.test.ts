import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOTION_FIELDS } from "@/core/notion-faces";

/**
 * "From a photo" in the browser, with MediaPipe and the canvas mocked: the
 * flow loads the models from this site, measures, suggests, and lets go of
 * every pixel. (The matching itself is tested in notion-faces-match.test.ts.)
 */
const calls = vi.hoisted(() => ({ created: [] as unknown[], detect: 0, segmentClosed: 0, face: true }));

/** A frontal face in a 900×900 crop: the landmarks the measures read, the rest at the face's centre. */
function landmarks() {
  const at: Record<number, [number, number]> = {
    234: [330, 450], 454: [570, 450], 10: [450, 300], 152: [450, 640], 168: [450, 410], 6: [450, 430], 2: [450, 520],
    33: [360, 420], 133: [415, 420], 159: [388, 410], 145: [388, 430], 263: [540, 420], 362: [485, 420], 386: [512, 410], 374: [512, 430],
    70: [355, 385], 63: [370, 378], 105: [388, 375], 66: [405, 378], 107: [420, 384], 46: [355, 392], 53: [370, 386], 52: [388, 384], 65: [405, 386], 55: [420, 391],
    300: [545, 385], 293: [530, 378], 334: [512, 375], 296: [495, 378], 336: [480, 384], 276: [545, 392], 283: [530, 386], 282: [512, 384], 295: [495, 386], 285: [480, 391],
    129: [415, 510], 358: [485, 510], 61: [395, 570], 291: [505, 570], 0: [450, 555], 17: [450, 590], 13: [450, 568], 14: [450, 574],
    172: [350, 560], 136: [365, 595], 150: [385, 620], 149: [410, 635], 397: [550, 560], 365: [535, 595], 379: [515, 620], 378: [490, 635],
    117: [370, 470], 118: [385, 470], 50: [375, 490], 101: [390, 485], 346: [530, 470], 347: [515, 470], 280: [525, 490], 330: [510, 485],
    109: [420, 320], 338: [480, 320], 151: [450, 330], 9: [450, 360],
  };
  return Array.from({ length: 478 }, (_, i) => {
    const [x, y] = at[i] ?? [450, 470];
    return { x: x / 900, y: y / 900, z: 0 };
  });
}

vi.mock("@mediapipe/tasks-vision", () => ({
  FaceLandmarker: {
    createFromOptions: async (fileset: unknown, options: unknown) => {
      calls.created.push({ task: "face", fileset, options });
      return {
        detect: () => {
          calls.detect++;
          return calls.face
            ? { faceLandmarks: [landmarks()], faceBlendshapes: [{ categories: [{ categoryName: "mouthSmileLeft", score: 0.8 }, { categoryName: "mouthSmileRight", score: 0.8 }] }] }
            : { faceLandmarks: [], faceBlendshapes: [] };
        },
      };
    },
  },
  ImageSegmenter: {
    createFromOptions: async (fileset: unknown, options: unknown) => {
      calls.created.push({ task: "hair", fileset, options });
      return {
        segment: () => {
          // Hair: a cap of the top of the head.
          const mask = new Uint8Array(256 * 256);
          for (let y = 50; y < 90; y++) for (let x = 90; x < 166; x++) mask[y * 256 + x] = 1;
          return { categoryMask: { width: 256, height: 256, getAsUint8Array: () => mask }, close: () => calls.segmentClosed++ };
        },
      };
    },
  },
}));

const canvases: { width: number; height: number }[] = [];
let bitmapClosed = 0;

beforeEach(() => {
  canvases.length = 0;
  bitmapClosed = 0;
  calls.face = true;
  vi.stubGlobal("createImageBitmap", async () => ({ width: 1200, height: 1600, close: () => bitmapClosed++ }));
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      expect(tag).toBe("canvas");
      const canvas = {
        width: 300,
        height: 150,
        getContext: () => ({
          fillStyle: "",
          fillRect: () => {},
          drawImage: () => {},
          // Even skin colour everywhere, darker hair at the top.
          getImageData: (_x: number, _y: number, w: number, h: number) => {
            const data = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < w * h; i++) {
              const dark = Math.floor(i / w) < 300;
              data.set(dark ? [35, 25, 20, 255] : [218, 154, 124, 255], i * 4);
            }
            return { width: w, height: h, data };
          },
        }),
      };
      canvases.push(canvas);
      return canvas;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

const photo = () => new Blob([new Uint8Array(8)], { type: "image/jpeg" });

describe("faceFromPhoto", () => {
  it("measures the photo in the browser and suggests three parts per category", async () => {
    const { faceFromPhoto } = await import("@/screens/admin/photo-face");
    const { features, suggestions } = await faceFromPhoto(photo());
    for (const f of NOTION_FIELDS) expect(suggestions[f].length, f).toBeGreaterThan(0);
    expect(suggestions.skin[0]).toBe(3);
    expect(suggestions.eyewear[0]).toBe(0);
    expect(features.mouth.smile).toBeCloseTo(0.8);
    expect(features.beard.chin).toBe(0);
    // Detected twice: on the whole photo, then on the crop round the head.
    expect(calls.detect).toBe(2);
    expect(calls.segmentClosed).toBe(1);
  });

  it("loads MediaPipe from this site, once, and nothing from elsewhere", async () => {
    const { faceFromPhoto } = await import("@/screens/admin/photo-face");
    await faceFromPhoto(photo());
    expect(calls.created).toHaveLength(2);
    const urls = JSON.stringify(calls.created).match(/"(?:wasm\w*Path|modelAssetPath)":"[^"]+"/g)!;
    expect(urls).toHaveLength(6);
    for (const u of urls) expect(u).toMatch(/":"\/mediapipe\//);
  });

  it("drops the pixels afterwards: the canvas is emptied and the bitmap closed", async () => {
    const { faceFromPhoto } = await import("@/screens/admin/photo-face");
    await faceFromPhoto(photo());
    expect(canvases).toHaveLength(1);
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect(bitmapClosed).toBeGreaterThan(0);
  });

  it("says when there's no face, and still drops the pixels", async () => {
    calls.face = false;
    const { faceFromPhoto } = await import("@/screens/admin/photo-face");
    await expect(faceFromPhoto(photo())).rejects.toMatchObject({ name: "PhotoFaceError", message: expect.stringMatching(/No face found/) });
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 });
    await expect(faceFromPhoto(new Blob(["x"], { type: "text/plain" }))).rejects.toMatchObject({ name: "PhotoFaceError" });
  });
});

describe("the photo never leaves the browser", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");

  it("has no network or storage call in the photo code", () => {
    for (const file of ["src/screens/admin/photo-face/index.ts", "src/screens/admin/photo-face/measure.ts", "src/core/notion-faces/match.ts"]) {
      const text = read(file);
      expect(text, file).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|localStorage|indexedDB|FormData|"use server"/);
    }
  });

  it("is loaded only on use: the constructor imports it dynamically, and only types statically", () => {
    const ui = read("src/screens/admin/ProfessorFaces.tsx");
    expect(ui).toContain('await import("./photo-face")');
    expect(ui).not.toMatch(/^import [^t].*(photo-face|notion-faces\/match|tasks-vision)/m);
    expect(ui).toMatch(/URL\.revokeObjectURL/);
  });
});
