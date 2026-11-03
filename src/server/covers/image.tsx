import { ImageResponse } from "next/og";
import { C, mascotDataUrl, ogFonts } from "./assets";
import { SITE_HOST, type CoverMeta } from "./meta";
import { ellipsize, measure } from "./text";

/**
 * Cover/Image frame: a 12 px paper frame and one caption bar under the
 * picture. The picture is drawn at its own pixels, never cropped or covered;
 * the hairline sits outside it. Output is PNG.
 */

export type ImageSize = { width: number; height: number; mime: "image/png" | "image/jpeg" };

/** Reads the pixel size of a PNG or JPEG; null for anything else. */
export function imageSize(b: Uint8Array): ImageSize | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20), mime: "image/png" };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8], mime: "image/jpeg" };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** "Whiteboard, lecture 9 · Calculus 1 · from students". */
export const imageCaption = (m: CoverMeta) =>
  [m.title, m.courseName, m.source === "lms" ? "from NewUU LMS" : "from students"].filter(Boolean).join(" · ");

const MAX = 2400;

/** The framed image as PNG, or null when the input is not a PNG/JPEG we can read. */
export async function brandImage(bytes: Uint8Array, meta: CoverMeta): Promise<Uint8Array | null> {
  const size = imageSize(bytes);
  if (!size || !size.width || !size.height) return null;
  // Keep the picture's own pixels (up to 2400 px wide); frame parts scale with it.
  const w = Math.min(size.width, MAX);
  const h = Math.round((size.height * w) / size.width);
  const s = Math.max(1, w / 576);
  const pad = 12 * s;
  const bar = 26 * s;
  const W = Math.round(w + pad * 2);
  const H = Math.round(h + pad * 2 + 10 * s + bar);
  const site = SITE_HOST;
  const siteW = measure(site, "medium", 11);
  const caption = ellipsize(imageCaption(meta), "semibold", 13, W / s - 24 - 26 - 20 - siteW);
  const src = `data:${size.mime};base64,${Buffer.from(bytes).toString("base64")}`;
  const res = new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: pad, gap: 10 * s, background: C.page }}>
        <div style={{ display: "flex", width: w, height: h, boxShadow: `0 0 0 ${s}px ${C.docLine}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={src} width={w} height={h} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 * s, height: bar }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={mascotDataUrl()} width={bar} height={bar} />
          <div style={{ display: "flex", flexGrow: 1, fontFamily: "Geologica", fontWeight: 600, fontSize: 13 * s, color: C.ink, whiteSpace: "pre" }}>{caption}</div>
          <div style={{ display: "flex", fontFamily: "Geologica", fontWeight: 500, fontSize: 11 * s, color: C.secondary }}>{site}</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: ogFonts() },
  );
  return new Uint8Array(await res.arrayBuffer());
}
