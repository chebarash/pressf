/**
 * Copies MediaPipe's vision wasm (from the pinned @mediapipe/tasks-vision in
 * package-lock) to public/mediapipe/wasm, so "From a photo" in the admin face
 * constructor loads it from this site, not a CDN. Runs before `next dev` and
 * `next build`; the copy is git-ignored. The models next to it
 * (face_landmarker.task, hair_segmenter.tflite) are committed: Google's
 * MediaPipe models, Apache-2.0, from storage.googleapis.com/mediapipe-models.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

const from = "node_modules/@mediapipe/tasks-vision/wasm";
const to = "public/mediapipe/wasm";
await mkdir(to, { recursive: true });
for (const name of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
  const src = join(from, name), dst = join(to, name);
  const [a, b] = await Promise.all([stat(src), stat(dst).catch(() => null)]);
  if (!b || b.size !== a.size || b.mtimeMs < a.mtimeMs) await copyFile(src, dst);
}
