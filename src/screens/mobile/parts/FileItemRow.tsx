import { FileRow } from "@/ui/components";
import type { FileItem } from "../views";

/** A FileItem as a File/Row v2 (course hidden: rows live on the course or class). */
export function FileItemRow({ file, course, className }: { file: FileItem; course?: string; className?: string }) {
  return (
    <FileRow
      title={file.title}
      type={file.type}
      course={course}
      date={file.dateLabel}
      source={{ label: file.from, kind: file.source === "lms" ? "lms" : "students" }}
      href={file.href}
      className={className}
    />
  );
}
