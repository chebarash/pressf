import { createHash } from "node:crypto";
import { extname } from "node:path";
import { putObject } from "@/lib/storage";
import { brandPdf } from "./brand";

type Source = {
  fileName: string; mimeType: string; courseCode: string | null; courseName: string | null;
  type: string | null; term: string | null; hasSolutions: boolean; author: string | null;
};

/** Saves the original and, for PDFs, the Press F copy the site serves. */
export async function storeMaterial(buffer: Buffer, source: Source) {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const extension = extname(source.fileName).toLowerCase();
  const originalKey = await putObject(`materials/${sha256}${extension}`, buffer, source.mimeType);
  let storageKey = originalKey;

  if (extension === ".pdf") {
    try {
      const branded = await brandPdf(buffer, {
        courseCode: source.courseCode!, courseName: source.courseName, type: source.type!,
        term: source.term, hasSolutions: source.hasSolutions, author: source.author,
      });
      storageKey = await putObject(`materials/${sha256}-pressf.pdf`, branded, "application/pdf");
    } catch (error) {
      // Encrypted PDFs cannot be edited; a plain file is better than no file.
      console.warn("Serving original, could not brand PDF", error);
    }
  }
  return { sha256, originalKey, storageKey };
}
