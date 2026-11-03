import { termSlug } from "@/core/semester";
import * as views from "@/server/views";
import * as adapt from "@/screens/desktop/adapt";

type Query = Record<string, string | string[] | undefined>;

/** Which list the D4 pane shows: "now" (default), "all", or an earlier semester ("Fall 2025"). */
export function listOf(q: Query, my: views.MyCoursesView | null): string {
  const raw = typeof q.list === "string" ? q.list : "now";
  if (raw === "all" && my?.earlier.length) return "all";
  return my?.earlier.find((e) => e.term === raw)?.term ?? "now";
}

/**
 * The D4 list pane for desktop: semester chips and the chosen semester's courses.
 * Earlier semesters are read only when their chip (or All) is on.
 */
export async function desktopCourseList(userId: string, q: Query, mine?: views.MyCoursesView | null) {
  const my = mine ?? (await views.myCourses(userId));
  if (!my) return null;
  const list = listOf(q, my);
  const terms = list === "now" ? [] : list === "all" ? my.earlier.map((e) => e.term) : [list];
  const earlier = (await Promise.all(terms.map((t) => views.termResults(userId, termSlug(t))))).filter((r): r is views.TermResultsView => !!r);
  return { list, my, ...adapt.courseList(my, list, earlier) };
}
