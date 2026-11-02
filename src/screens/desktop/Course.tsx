import { CourseLayout } from "./course/CourseView";
import type { CourseView } from "@/server/views";
import * as adapt from "./adapt";

/** D4 Course — your courses on the left, the course in the middle, ratings and "you in this course" on the right. */
export default function DesktopCourse({ data }: { data: CourseView }) {
  return <CourseLayout data={adapt.course(data)} />;
}
