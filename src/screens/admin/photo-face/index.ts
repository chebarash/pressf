/**
 * "From a photo" in the admin face constructor, in the browser only: the
 * photo is decoded here, measured by MediaPipe (face landmarks with
 * blendshapes, and a hair mask) running on this machine from files the site
 * serves itself (public/mediapipe), and turned into Notion part suggestions.
 * Nothing is uploaded or stored: the pixels are dropped as soon as the
 * numbers are taken. Loaded with import() only when the admin picks a photo,
 * so none of it is in any page's bundle.
 */
import type { FaceLandmarker, ImageSegmenter } from "@mediapipe/tasks-vision";
import { suggestFace, type PhotoFeatures, type Suggestions } from "@/core/notion-faces/match";
import { measureFace, type Blendshapes, type Debug, type HairMask } from "./measure";

/** Served from public/mediapipe (scripts/mediapipe-assets.mjs copies the wasm from the pinned npm package). */
const BASE = "/mediapipe";
const FILESET = { wasmLoaderPath: `${BASE}/wasm/vision_wasm_internal.js`, wasmBinaryPath: `${BASE}/wasm/vision_wasm_internal.wasm` };
const MAX_SIDE = 1024;
/** The square the face is measured on: the head about 300 px wide. */
const CROP = 900;

type Models = { landmarker: FaceLandmarker; segmenter: ImageSegmenter };
let models: Promise<Models> | null = null;

/** The two models, created once per page (a few MB, cached by the browser after the first time). */
function loadModels(): Promise<Models> {
  models ??= (async () => {
    const { FaceLandmarker, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const landmarker = await FaceLandmarker.createFromOptions(FILESET, {
      baseOptions: { modelAssetPath: `${BASE}/face_landmarker.task`, delegate: "CPU" },
      runningMode: "IMAGE",
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
    const segmenter = await ImageSegmenter.createFromOptions(FILESET, {
      baseOptions: { modelAssetPath: `${BASE}/hair_segmenter.tflite`, delegate: "CPU" },
      runningMode: "IMAGE",
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    });
    return { landmarker, segmenter };
  })();
  models.catch(() => (models = null));
  return models;
}

export class PhotoFaceError extends Error {
  name = "PhotoFaceError";
}

/**
 * Measures the face on a photo and suggests parts (top three per category).
 * The photo stays in this tab. `debug` (tuning only) receives the sampled regions.
 */
export async function faceFromPhoto(file: Blob, debug?: Debug): Promise<{ features: PhotoFeatures; suggestions: Suggestions }> {
  if (!file.type.startsWith("image/")) throw new PhotoFaceError("Pick a photo (JPEG, PNG, WebP or HEIC)");
  let bitmap: ImageBitmap | null = null;
  const canvas = document.createElement("canvas");
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
      throw new PhotoFaceError("This browser can't read that photo; try a JPEG or PNG");
    });
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const { landmarker, segmenter } = await loadModels();

    // 1. Find the face on the whole photo.
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const first = landmarker.detect(canvas).faceLandmarks[0];
    if (!first) throw new PhotoFaceError("No face found: use a photo where the face is clear and looks at the camera");

    // 2. Measure on a square around the head (room for hair, ears and neck), the face about 300 px wide.
    const xs = first.map((p) => p.x * bitmap!.width), ys = first.map((p) => p.y * bitmap!.height);
    const faceW = Math.max(...xs) - Math.min(...xs);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const side = faceW * 3;
    canvas.width = canvas.height = CROP;
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, CROP, CROP);
    ctx.drawImage(bitmap, cx - side / 2, cy - side * 0.55, side, side, 0, 0, CROP, CROP);
    bitmap.close();
    bitmap = null;

    const found = landmarker.detect(canvas);
    const points = found.faceLandmarks[0];
    if (!points) throw new PhotoFaceError("No face found: use a photo where the face is clear and looks at the camera");
    const landmarks = points.map((p) => ({ x: p.x * CROP, y: p.y * CROP }));
    const blendshapes: Blendshapes = Object.fromEntries((found.faceBlendshapes[0]?.categories ?? []).map((c) => [c.categoryName, c.score]));

    let hair: HairMask | null = null;
    const seg = segmenter.segment(canvas);
    try {
      const mask = seg.categoryMask;
      if (mask) hair = { width: mask.width, height: mask.height, data: mask.getAsUint8Array().slice() };
    } finally {
      seg.close();
    }

    const pixels = ctx.getImageData(0, 0, CROP, CROP);
    const features = measureFace({ pixels, landmarks, blendshapes, hair, debug });
    if (debug) debug.size = [CROP, CROP, cx - side / 2, cy - side * 0.55, side];
    return { features, suggestions: suggestFace(features) };
  } finally {
    bitmap?.close();
    // Drop the pixels: an empty canvas holds no image data.
    canvas.width = canvas.height = 0;
  }
}
