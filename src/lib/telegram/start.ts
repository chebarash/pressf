/** Turns a start value into a page: course_MATH111, files_MATH111, professor_g-pinto, file_<id>. */
export function startPath(param?: string | null) {
  const [, kind, id] = param?.match(/^(course|files|professor|file)_([\w-]+)$/) ?? [];
  if (!kind) return null;
  if (kind === "professor") return `/professors/${id}`;
  if (kind === "file") return `/files?open=${id}`;
  return `/courses/${id}${kind === "files" ? "#files" : ""}`;
}

/** What a start link carries for a page. Telegram allows only letters, digits, _ and -. */
export function startParam(path: string) {
  const [, kind, id, hash] = decodeURIComponent(path).match(/^\/(courses|professors|files)\/([\w-]+)(#files)?$/) ?? [];
  if (!kind) return "";
  if (kind === "courses") return `${hash ? "files" : "course"}_${id}`;
  return `${kind === "professors" ? "professor" : "file"}_${id}`;
}
