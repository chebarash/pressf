import { brandPdf } from "./brand";

/**
 * The Press F copy of a shared PDF. The one place to swap in the new covers
 * (src/server/covers) when they land; until then the existing brand.ts template.
 * Throws on encrypted or broken files; callers then keep the original.
 */
export type CoverDetails = { title: string; courseCode: string; courseName: string; type: string; term?: string | null; shownAs: string };

export const coverPdf = (original: Buffer, d: CoverDetails): Promise<Buffer> =>
  brandPdf(original, {
    courseCode: d.courseCode,
    courseName: d.courseName,
    type: d.title,
    term: null,
    hasSolutions: false,
    author: d.shownAs === "From students" ? null : d.shownAs.replace(/^From /, ""),
  });
