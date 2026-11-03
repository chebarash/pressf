import { CourseLayout, type CourseTab } from "./course/CourseView";
import type { CourseListPane } from "./Courses";
import type { CourseView } from "@/server/views";
import * as adapt from "./adapt";

/**
 * D4 Course — your courses on the left, the course in the middle (Overview, Files
 * or Anonymous from the route), ratings and "you in this course" on the right.
 */
export default function DesktopCourse({ data, tab = "overview", list, query }: { data: CourseView; tab?: CourseTab; list?: CourseListPane | null; query?: string }) {
  const base = adapt.course(data);
  return <CourseLayout data={{ ...base, ...(list ? { myCourses: list.courses, terms: list.terms } : {}), tabQuery: query }} tab={tab} />;
}
