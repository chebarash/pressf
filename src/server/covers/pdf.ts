import { PDFDocument, type PDFPage } from "pdf-lib";
import { drawPdf, pdfKit, renderPng, type Scene } from "./draw";
import type { CoverMeta } from "./meta";
import { a4Cover, pageStamp, slideCover } from "./scenes";

/**
 * PDF covers. The cover is one new first page with the size and orientation of
 * page 1 (Cover/A4 for portrait, Cover/Slide for landscape). Original pages are
 * kept as they are; the optional page stamp only adds a footer inside bottom
 * margins of at least 24 pt and skips pages whose margin it cannot measure.
 */

export const A4 = { w: 595, h: 842 };
export const SLIDE = { w: 1280, h: 720 };

/** Visible size of a page (crop box, rotation applied). */
export function visibleSize(page: PDFPage) {
  const box = page.getCropBox();
  const turned = ((page.getRotation().angle % 360) + 360) % 180 === 90;
  return turned ? { w: box.height, h: box.width } : { w: box.width, h: box.height };
}

/** The cover scene for a page of `w`×`h` points, and the scale from scene units to points. */
export function coverScene(meta: CoverMeta, w: number, h: number, pages?: number | null): { scene: Scene; scale: number } {
  if (w > h) {
    const scale = Math.min(w / SLIDE.w, h / SLIDE.h);
    return { scene: slideCover(meta, w / scale, h / scale, pages ?? meta.pages), scale };
  }
  const scale = Math.min(w / A4.w, h / A4.h);
  return { scene: a4Cover({ ...meta, pages: pages ?? meta.pages }, w / scale, h / scale), scale };
}

export type PdfBrandOptions = { stamp?: boolean };

/** Returns the PDF with a cover page in front (and page stamps when asked). Unreadable or encrypted PDFs come back unchanged. */
export async function brandPdf(bytes: Uint8Array, meta: CoverMeta, opts: PdfBrandOptions = {}): Promise<Uint8Array> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    return bytes;
  }
  if (doc.isEncrypted || doc.getPageCount() === 0) return bytes;
  const count = doc.getPageCount();
  const kit = pdfKit(doc);
  const { w, h } = visibleSize(doc.getPage(0));
  const cover = doc.insertPage(0, [w, h]);
  const { scene, scale } = coverScene(meta, w, h, meta.pages ?? count);
  await drawPdf(kit, cover, scene, scale);

  if (opts.stamp) {
    const margins = await bottomMargins(bytes).catch(() => null);
    if (margins) {
      for (let i = 0; i < count; i++) {
        const margin = margins[i];
        const page = doc.getPage(i + 1);
        if (margin == null || margin < 24 || page.getRotation().angle % 360 !== 0) continue;
        const box = page.getCropBox();
        const stamp = pageStamp(meta, box.width, box.height, i + 1, count, margin);
        await drawPdf(kit, page, stamp, 1, box.x, page.getHeight() - box.y - box.height);
      }
    }
  }
  doc.setProducer("Press F");
  return doc.save();
}

type TextItem = { transform: number[]; height: number; str: string };

/**
 * Empty space under the lowest text on each page, in points; null where the
 * page has no text (scans), since we cannot tell what an image covers.
 */
export async function bottomMargins(bytes: Uint8Array): Promise<Array<number | null>> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const pdf = await task.promise;
  try {
    const out: Array<number | null> = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const [, y0] = page.view;
      const ops = await page.getOperatorList();
      const hasImage = ops.fnArray.some((fn: number) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject);
      const items = (await page.getTextContent()).items as TextItem[];
      const text = items.filter((t) => t.str.trim());
      if (!text.length || hasImage) {
        out.push(null);
        continue;
      }
      const low = Math.min(...text.map((t) => t.transform[5] - Math.abs(t.height) * 0.25));
      out.push(Math.max(0, low - y0));
    }
    return out;
  } finally {
    await pdf.destroy();
  }
}

/** Just the cover as a one-page PDF (A4, or slide-shaped when `landscape`). */
export async function coverPdf(meta: CoverMeta, size: { w: number; h: number } = A4): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const kit = pdfKit(doc);
  const page = doc.addPage([size.w, size.h]);
  const { scene, scale } = coverScene(meta, size.w, size.h);
  await drawPdf(kit, page, scene, scale);
  doc.setProducer("Press F");
  return doc.save();
}

/**
 * The cover as a PNG. By default it fits a 320×320 box, the Telegram
 * thumbnail limit; pass `width` for a bigger preview.
 */
export async function coverPng(meta: CoverMeta, opts: { landscape?: boolean; width?: number } = {}) {
  const size = opts.landscape ? SLIDE : A4;
  const { scene } = coverScene(meta, size.w, size.h);
  return renderPng(scene, opts.width ?? Math.floor((320 * scene.w) / Math.max(scene.w, scene.h)));
}
