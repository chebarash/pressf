import type { FileType } from "@/core/files";

/**
 * Flag colour by content type. Figma File/Row v2 defines Exam, Mock, Lecture,
 * Notes, Syllabus; the other core types reuse the nearest family.
 */
export const FILE_FLAG: Record<FileType, "exam" | "mock" | "lecture" | "notes" | "syllabus" | "other"> = {
  exam: "exam",
  mock: "mock",
  assignment: "mock",
  lecture: "lecture",
  lab: "lecture",
  notes: "notes",
  practice: "notes",
  syllabus: "syllabus",
  book: "syllabus",
  other: "other",
};
