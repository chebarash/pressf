const SEASON: Record<string, number> = { Fall: 3, Summer: 2, Spring: 1 };

/** Sorts terms by time: Fall 2025 comes after Spring 2025. */
export const termOrder = (term: string) => Number(term.match(/\d{4}/)?.[0] ?? 0) * 10 + (SEASON[term.split(" ")[0]] ?? 0);

type Groupable = { courseCode: string | null; courseName: string | null; term: string | null };

/** Files by course: the student's courses first, then the fullest, newest files on top. */
export function groupByCourse<T extends Groupable>(files: T[], mine: Set<string | null> = new Set()) {
  const groups = new Map<string, { code: string | null; name: string; files: T[] }>();
  for (const file of files) {
    const key = file.courseCode ?? "";
    if (!groups.has(key)) groups.set(key, { code: file.courseCode, name: file.courseName ?? file.courseCode ?? "Other files", files: [] });
    groups.get(key)!.files.push(file);
  }
  for (const group of groups.values()) group.files.sort((a, b) => termOrder(b.term ?? "") - termOrder(a.term ?? ""));
  const rank = (group: { code: string | null }) => (group.code === null ? 2 : mine.has(group.code) ? 0 : 1);
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || b.files.length - a.files.length || a.name.localeCompare(b.name));
}

/** Drops the course from a file's name where the group already says it. */
export const shortTitle = (title: string, course: string | null) => {
  if (!course || !title.toLowerCase().startsWith(`${course.toLowerCase()} `)) return title;
  return title.slice(course.length + 1);
};
