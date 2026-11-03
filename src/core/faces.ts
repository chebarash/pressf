/**
 * Professor faces are drawings (Notion-Faces style line art), never photos.
 * Admins upload a PNG with a transparent background or an SVG; these checks run
 * on the server before anything reaches the bucket.
 */

export const FACE_MAX_BYTES = 512 * 1024;
export const FACE_MIN_PX = 96;
export const FACE_MAX_PX = 2048;

export type FaceFormat = { type: "png"; contentType: "image/png"; ext: "png"; width: number; height: number } | { type: "svg"; contentType: "image/svg+xml"; ext: "svg" };
export type FaceCheck = { ok: true; format: FaceFormat } | { ok: false; error: string };

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

/** PNG header: size and whether it can be transparent (alpha channel or a tRNS chunk). */
function png(bytes: Uint8Array): { width: number; height: number; transparent: boolean } | null {
  if (bytes.length < 33 || PNG_MAGIC.some((v, i) => bytes[i] !== v) || ascii(bytes, 12, 4) !== "IHDR") return null;
  const width = u32(bytes, 16);
  const height = u32(bytes, 20);
  const colorType = bytes[25];
  let transparent = colorType === 4 || colorType === 6;
  // Walk the chunks up to the image data looking for tRNS (palette or single-colour transparency).
  for (let at = 8; !transparent && at + 8 <= bytes.length; ) {
    const length = u32(bytes, at);
    const type = ascii(bytes, at + 4, 4);
    if (type === "tRNS") transparent = true;
    if (type === "IDAT" || type === "IEND") break;
    at += 12 + length;
  }
  return { width, height, transparent };
}

/** Anything that could run or load content when the SVG is opened directly. */
const SVG_UNSAFE = [
  /<script/i,
  /<foreignObject/i,
  /<(iframe|embed|object|audio|video|image)\b/i,
  /\son[a-z]+\s*=/i,
  /javascript:/i,
  /<!ENTITY/i,
  /(?:xlink:)?href\s*=\s*["']\s*(?!#)/i,
  /url\(\s*["']?\s*(?!#)/i,
  /@import/i,
];

/** The document's first element is <svg> (after an XML declaration, comments and a doctype). Linear, no backtracking. */
function startsWithSvg(text: string): boolean {
  let at = 0;
  for (;;) {
    while (at < text.length && /\s/.test(text[at])) at++;
    const skip = (open: string, close: string) => {
      if (text.slice(at, at + open.length).toLowerCase() !== open) return false;
      const end = text.indexOf(close, at + open.length);
      if (end < 0) return false;
      at = end + close.length;
      return true;
    };
    if (skip("<?xml", "?>") || skip("<!--", "-->") || skip("<!doctype", ">")) continue;
    return /^<svg[\s>]/i.test(text.slice(at, at + 5));
  }
}

export function checkFace(bytes: Uint8Array): FaceCheck {
  if (!bytes.length) return { ok: false, error: "The file is empty" };
  if (bytes.length > FACE_MAX_BYTES) return { ok: false, error: "Faces are line drawings: keep the file under 512 KB" };
  const p = png(bytes);
  if (p) {
    if (!p.transparent) return { ok: false, error: "Use a PNG with a transparent background (a drawn head, no backdrop)" };
    if (p.width < FACE_MIN_PX || p.height < FACE_MIN_PX) return { ok: false, error: `Too small: at least ${FACE_MIN_PX}×${FACE_MIN_PX} px` };
    if (p.width > FACE_MAX_PX || p.height > FACE_MAX_PX) return { ok: false, error: `Too large: at most ${FACE_MAX_PX}×${FACE_MAX_PX} px` };
    const ratio = p.width / p.height;
    if (ratio < 0.8 || ratio > 1.25) return { ok: false, error: "Faces are square: crop the drawing to about 1:1" };
    return { ok: true, format: { type: "png", contentType: "image/png", ext: "png", width: p.width, height: p.height } };
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.length, FACE_MAX_BYTES)));
  if (startsWithSvg(text)) {
    if (SVG_UNSAFE.some((r) => r.test(text))) return { ok: false, error: "This SVG has scripts, links or embedded images: export plain vector paths" };
    return { ok: true, format: { type: "svg", contentType: "image/svg+xml", ext: "svg" } };
  }
  return { ok: false, error: "Upload a PNG or an SVG drawing" };
}

/** Content type from a stored key, for objects saved without one. */
export const faceContentType = (key: string) => (/\.svg$/i.test(key) ? "image/svg+xml" : /\.webp$/i.test(key) ? "image/webp" : /\.jpe?g$/i.test(key) ? "image/jpeg" : "image/png");
