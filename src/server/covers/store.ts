import { createHash } from "node:crypto";
import { objectExists, putObject, signedUrl } from "@/lib/storage";
import { brandFile, COVER_VERSION } from "./index";
import type { CoverMeta } from "./meta";

/**
 * Branded copies are made once per file version and kept in the bucket:
 *   branded/v<COVER_VERSION>/<sha256>-<meta digest>.<ext>
 * The meta digest changes when what the cover says changes (title, week,
 * teacher…). Requests get a signed URL to the stored copy; nothing is
 * re-branded per request.
 */

export type BrandStore = {
  exists(key: string): Promise<boolean>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<unknown>;
  url(key: string, fileName: string, disposition?: "inline" | "attachment"): Promise<string>;
};

const bucket: BrandStore = {
  exists: objectExists,
  put: (key, bytes, type) => putObject(key, Buffer.from(bytes), type),
  url: (key, name, disposition) => signedUrl(key, name, disposition),
};

const digest = (meta: CoverMeta, stamp: boolean) =>
  createHash("sha256")
    .update(JSON.stringify({ ...meta, stamp, uploadedAt: meta.uploadedAt?.toISOString(), exam: meta.exam && { ...meta.exam, date: meta.exam.date?.toISOString() } }))
    .digest("hex")
    .slice(0, 12);

const EXT_OUT: Record<string, string> = { jpg: "png", jpeg: "png", png: "png" };
/** Extensions that get a cover; everything else is served as uploaded. */
export const BRANDABLE = new Set(["pdf", "docx", "pptx", "xlsx", "zip", "png", "jpg", "jpeg"]);

export function brandedKey(sha256: string, extension: string, meta: CoverMeta, stamp = false) {
  const ext = EXT_OUT[extension] ?? extension;
  return `branded/v${COVER_VERSION}/${sha256}-${digest(meta, stamp)}${ext ? `.${ext}` : ""}`;
}

export type BrandedCopy = { key: string; url: string; fileName: string; contentType: string };

const inflight = new Map<string, Promise<BrandedCopy | null>>();

/**
 * The stored branded copy of a file, created on first use. Returns null when
 * the file gets no cover (audio, video, unknown or unreadable files): serve the
 * original then. `load` is only called when the copy has to be made.
 */
export function brandedCopy(
  file: { sha256: string; name: string; mimeType?: string | null; load: () => Promise<Uint8Array> },
  meta: CoverMeta,
  opts: { stamp?: boolean; store?: BrandStore; disposition?: "inline" | "attachment" } = {},
): Promise<BrandedCopy | null> {
  const store = opts.store ?? bucket;
  const ext = file.name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase() ?? "";
  if (!BRANDABLE.has(ext)) return Promise.resolve(null);
  const key = brandedKey(file.sha256, ext, meta, !!opts.stamp);
  const outExt = key.match(/\.([a-z0-9]+)$/)?.[1] ?? ext;
  const fileName = outExt && outExt !== ext ? `${file.name.replace(/\.[^.]+$/, "")}.${outExt}` : file.name;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = (async () => {
    if (await store.exists(key)) return { key, url: await store.url(key, fileName, opts.disposition), fileName, contentType: contentTypeOf(outExt) };
    const out = await brandFile(await file.load(), { name: file.name, mimeType: file.mimeType }, meta, { stamp: opts.stamp });
    if (!out.branded) return null;
    await store.put(key, out.bytes, out.contentType);
    return { key, url: await store.url(key, fileName, opts.disposition), fileName, contentType: out.contentType };
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

function contentTypeOf(ext: string) {
  return (
    {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      zip: "application/zip",
      png: "image/png",
    }[ext] ?? "application/octet-stream"
  );
}
