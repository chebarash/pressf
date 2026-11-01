import { createHash } from "node:crypto";
import { extname } from "node:path";
import { putObject } from "@/lib/storage";
import { brandPdf } from "./brand";

type Source = {
  fileName: string; mimeType: string; courseCode: string | null; courseName: string | null;
  type: string | null; term: string | null; hasSolutions: boolean; author: string | null;
};

type Named = Pick<Source, "fileName" | "courseCode" | "courseName" | "type" | "term" | "hasSolutions" | "author">;

/**
 * The one way files are named: course, kind, term, then what sets it apart, as in
 * "Calculus 1 Midterm Fall 2024 Solutions". Books and notes keep their own title.
 */
export function standardName(file: Named) {
  const extension = extname(file.fileName);
  const title = file.fileName.slice(0, file.fileName.length - extension.length).replace(/[_\s]+/g, " ").trim();
  const kind = file.type ? file.type[0].toUpperCase() + file.type.slice(1) : null;
  const detail = file.type === "syllabus" || file.type === "midterm" || file.type === "final" || file.type === "mock" ? file.term : title;
  const parts = [file.courseName ?? file.courseCode, kind, detail, file.hasSolutions && "Solutions", file.author && `by ${file.author}`];
  return `${parts.filter(Boolean).join(" ")}${extension}`;
}

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
