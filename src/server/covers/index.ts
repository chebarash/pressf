import { extensionOf, formatOf } from "@/core/files";
import { brandImage } from "./image";
import type { CoverMeta } from "./meta";
import { brandDocx, brandPptx, brandXlsx } from "./office";
import { brandPdf } from "./pdf";
import { archiveReadme, README_NAME } from "./scenes";
import { drawPdf, pdfKit } from "./draw";
import { PDFDocument } from "pdf-lib";
import { makeEntry, readZip, writeZip } from "./zip";

/**
 * Branded copies of course files (Figma 12 · "Covers inside the file"). The
 * original content is never changed: PDF/Word get a first cover page, slides a
 * first slide, Excel an About sheet, images a thin frame, zips a README.
 * Audio and video come back as they are (no ffmpeg on the server); their
 * intro/art cards are available as PNG for the bot (see ./media).
 */

export type { CoverMeta, CoverSource } from "./meta";
export { coverPdf, coverPng, brandPdf, coverScene } from "./pdf";
export { brandImage, imageSize } from "./image";
export { brandDocx, brandPptx, brandXlsx, ABOUT_SHEET } from "./office";
export { videoIntroPng, audioArtPng } from "./media";
export { README_NAME } from "./scenes";

/** Bump when cover layouts change, so stored copies are regenerated. */
export const COVER_VERSION = 1;

export type Branded = {
  bytes: Uint8Array;
  /** False when the file was returned as it was (unsupported or unreadable). */
  branded: boolean;
  contentType: string;
  /** Extension of the result (images become PNG). */
  extension: string;
  note?: string;
};

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  png: "image/png",
};

/** Brands a file by its name/extension. Never throws for bad input: it returns the original instead. */
export async function brandFile(bytes: Uint8Array, file: { name: string; mimeType?: string | null }, meta: CoverMeta, opts: { stamp?: boolean } = {}): Promise<Branded> {
  const ext = extensionOf(file.name);
  const original = (note?: string): Branded => ({ bytes, branded: false, contentType: file.mimeType || MIME[ext] || "application/octet-stream", extension: ext, note });
  const done = (out: Uint8Array | null, e = ext): Branded => (out && out !== bytes ? { bytes: out, branded: true, contentType: MIME[e] ?? file.mimeType ?? "application/octet-stream", extension: e } : original("Could not read the file; kept as it was."));
  try {
    const format = formatOf(file.name);
    if (ext === "pdf") return done(await brandPdf(bytes, meta, opts));
    if (ext === "docx") return done(await brandDocx(bytes, meta));
    if (ext === "pptx") return done(await brandPptx(bytes, meta));
    if (ext === "xlsx") return done(await brandXlsx(bytes, meta));
    if (ext === "zip") return done(await brandZip(bytes, meta));
    if (format === "image") return done(await brandImage(bytes, meta), "png");
    if (format === "video" || format === "audio") return original("Audio and video are served as uploaded; the intro card and cover art are separate PNGs (videoIntroPng, audioArtPng).");
    return original(`No cover for .${ext || "?"} files.`);
  } catch {
    return original("Branding failed; kept as it was.");
  }
}

/** Adds "Press F — about this archive.pdf" at the top level; nothing inside is renamed or recompressed. */
export async function brandZip(bytes: Uint8Array, meta: CoverMeta): Promise<Uint8Array | null> {
  const entries = readZip(bytes);
  if (!entries || entries.some((e) => e.name === README_NAME)) return null;
  const listed = entries.map((e) => ({ name: e.name, size: e.size }));
  const doc = await PDFDocument.create();
  const kit = pdfKit(doc);
  const page = doc.addPage([595, 842]);
  await drawPdf(kit, page, archiveReadme(meta, listed));
  doc.setProducer("Press F");
  const readme = makeEntry(README_NAME, await doc.save());
  return writeZip([readme, ...entries]);
}
