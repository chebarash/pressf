import { CourseLayout } from "./course/CourseView";
import type { CourseData } from "./fixtures/types";

/** D4 Course — your courses on the left, the course in the middle, ratings and "you in this course" on the right. */
export default function DesktopCourse({ data }: { data: CourseData }) {
  return <CourseLayout data={data} />;
}
