import { ImageResponse } from "next/og";
import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { C, FAMILY, fontBytes, mascotDataUrl, mascotPng, ogFonts, type FontKey } from "./assets";
import { qrMatrix, qrSvg } from "./qr";
import { baseline, clean, measure, runs } from "./text";

/**
 * A cover is laid out once as a list of positioned shapes (points, top-left
 * origin) and drawn by two backends: pdf-lib for the PDF page (real text,
 * embedded fonts, vector QR) and next/og for PNG previews and thumbnails.
 */

export type Img = { bytes: Uint8Array; mime: "image/png" | "image/jpeg" };

export type Prim =
  | { k: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; r?: number; shadow?: number }
  | { k: "text"; x: number; top: number; lh: number; size: number; font: FontKey; color: string; text: string }
  | { k: "image"; x: number; y: number; w: number; h: number; src: "mascot" | Img }
  | { k: "qr"; x: number; y: number; size: number; text: string };

export type Scene = { w: number; h: number; prims: Prim[] };

function color(hex: string) {
  const h = hex.replace("#", "");
  const v = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return { color: rgb(v(0), v(2), v(4)), opacity: h.length >= 8 ? v(6) : 1 };
}

function roundedPath(w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!r) return `M0 0H${w}V${h}H0Z`;
  return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
}

export type PdfKit = { fonts: Map<FontKey, PDFFont>; images: Map<unknown, PDFImage>; doc: PDFDocument };

/** Prepares a document for drawing covers (fonts are embedded on first use, subset). */
export function pdfKit(doc: PDFDocument): PdfKit {
  doc.registerFontkit(fontkit);
  return { fonts: new Map(), images: new Map(), doc };
}

async function font(kit: PdfKit, key: FontKey) {
  let f = kit.fonts.get(key);
  if (!f) kit.fonts.set(key, (f = await kit.doc.embedFont(fontBytes(key), { subset: true })));
  return f;
}

async function image(kit: PdfKit, src: "mascot" | Img) {
  let i = kit.images.get(src === "mascot" ? "mascot" : src.bytes);
  if (!i) {
    i = src === "mascot" ? await kit.doc.embedPng(mascotPng()) : src.mime === "image/png" ? await kit.doc.embedPng(src.bytes) : await kit.doc.embedJpg(src.bytes);
    kit.images.set(src === "mascot" ? "mascot" : src.bytes, i);
  }
  return i;
}

/**
 * Draws a scene onto a PDF page. `scale` maps scene units to points and
 * (`ox`, `oy`) is the scene's top-left corner in page points (top-left origin).
 */
export async function drawPdf(kit: PdfKit, page: PDFPage, scene: Scene, scale = 1, ox = 0, oy = 0) {
  const H = page.getHeight();
  const X = (x: number) => ox + x * scale;
  const Y = (y: number) => H - (oy + y * scale);
  for (const p of scene.prims) {
    if (p.k === "rect") {
      const path = roundedPath(p.w * scale, p.h * scale, (p.r ?? 0) * scale);
      if (p.shadow) page.drawSvgPath(path, { x: X(p.x), y: Y(p.y + p.shadow), ...fill(C.key) });
      if (p.fill) page.drawSvgPath(path, { x: X(p.x), y: Y(p.y), ...fill(p.fill) });
      if (p.stroke && p.sw) {
        // Figma strokes sit inside the frame; pdf strokes are centred on the path.
        const i = (p.sw / 2) * scale;
        const inner = roundedPath(p.w * scale - 2 * i, p.h * scale - 2 * i, Math.max(0, (p.r ?? 0) * scale - i));
        const c = color(p.stroke);
        page.drawSvgPath(inner, { x: X(p.x) + i, y: Y(p.y) - i, borderColor: c.color, borderOpacity: c.opacity, borderWidth: p.sw * scale });
      }
    } else if (p.k === "text") {
      const y = baseline(p.top, p.lh, p.font, p.size);
      let x = p.x;
      const c = color(p.color);
      for (const r of runs(p.text, p.font)) {
        page.drawText(r.text, { x: X(x), y: Y(y), size: p.size * scale, font: await font(kit, r.font), color: c.color, opacity: c.opacity });
        x += measure(r.text, r.font, p.size);
      }
    } else if (p.k === "image") {
      page.drawImage(await image(kit, p.src), { x: X(p.x), y: Y(p.y + p.h), width: p.w * scale, height: p.h * scale });
    } else if (p.k === "qr") {
      const m = qrMatrix(p.text);
      const cell = p.size / m.length;
      const c = color(C.docInk);
      for (let row = 0; row < m.length; row++) {
        for (let col = 0; col < m.length; col++) {
          if (!m[row][col]) continue;
          let run = 1;
          while (col + run < m.length && m[row][col + run]) run++;
          page.drawRectangle({ x: X(p.x + col * cell), y: Y(p.y + (row + 1) * cell), width: run * cell * scale, height: cell * scale, color: c.color });
          col += run - 1;
        }
      }
    }
  }
}

function fill(hex: string) {
  const c = color(hex);
  return { color: c.color, opacity: c.opacity, borderWidth: 0 };
}

const dataUrl = (img: Img) => `data:${img.mime};base64,${Buffer.from(img.bytes).toString("base64")}`;

/** The scene as absolutely positioned JSX (for next/og). */
export function SceneView({ scene, scale = 1 }: { scene: Scene; scale?: number }) {
  const s = scale;
  return (
    <div style={{ display: "flex", position: "relative", width: scene.w * s, height: scene.h * s, overflow: "hidden" }}>
      {scene.prims.map((p, i) => {
        if (p.k === "rect") {
          return (
            <div
              key={i}
              style={{
                position: "absolute", left: p.x * s, top: p.y * s, width: p.w * s, height: p.h * s, borderRadius: (p.r ?? 0) * s,
                ...(p.fill ? { backgroundColor: p.fill } : {}),
                ...(p.stroke && p.sw ? { border: `${p.sw * s}px solid ${p.stroke}` } : {}),
                ...(p.shadow ? { boxShadow: `0 ${p.shadow * s}px 0 ${C.key}` } : {}),
              }}
            />
          );
        }
        if (p.k === "text") {
          const f = FAMILY[p.font];
          return (
            <div key={i} style={{ position: "absolute", display: "flex", left: p.x * s, top: p.top * s, height: p.lh * s, lineHeight: `${p.lh * s}px`, fontSize: p.size * s, fontFamily: f.family, fontWeight: f.weight, color: p.color, whiteSpace: "pre" }}>
              {clean(p.text, p.font)}
            </div>
          );
        }
        if (p.k === "image") {
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={i} alt="" src={p.src === "mascot" ? mascotDataUrl() : dataUrl(p.src)} width={p.w * s} height={p.h * s} style={{ position: "absolute", left: p.x * s, top: p.y * s }} />;
        }
        const svg = qrSvg(p.text, p.size * s, C.docInk);
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={i} alt="" src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={p.size * s} height={p.size * s} style={{ position: "absolute", left: p.x * s, top: p.y * s }} />;
      })}
    </div>
  );
}

/** Renders a scene to PNG bytes, `width` pixels wide. */
export async function renderPng(scene: Scene, width = scene.w) {
  const s = width / scene.w;
  const res = new ImageResponse(<SceneView scene={scene} scale={s} />, { width: Math.round(scene.w * s), height: Math.round(scene.h * s), fonts: ogFonts() });
  return new Uint8Array(await res.arrayBuffer());
}
