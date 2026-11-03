import { CourseList } from "./course/CourseList";
import c from "./course/course.module.css";
import { CourseLayout } from "./course/CourseView";
import type { CourseView, MyCoursesView } from "@/server/views";
import * as adapt from "./adapt";
import type { CoursesData } from "./model";
import { CourseCard, css, cx, Empty } from "./parts";

export type CourseListPane = { terms: CoursesData["terms"]; courses: CoursesData["courses"] };

/**
 * D4 Courses: the list selects a course, the right side is that course (the first
 * one of the chosen semester when the URL names none). Without any course yet it
 * keeps the list and says why.
 */
export default function DesktopCourses({ data, list, course }: { data: MyCoursesView; list?: CourseListPane | null; course?: CourseView | null }) {
  if (course && list) return <CourseLayout data={{ ...adapt.course(course), myCourses: list.courses, terms: list.terms }} />;
  const base = adapt.myCourses(data);
  return <CoursesScreen data={list ? { ...base, terms: list.terms, courses: list.courses, cards: [] } : base} />;
}

/** No course to open: the list pane plus an empty state (or the cards in demo mode). */
export function CoursesScreen({ data }: { data: CoursesData }) {
  return (
    <div data-desktop-screen className={cx(css.screen, c.layout, c.layoutPick)}>
      <CourseList courses={data.courses} terms={data.terms} current={null} />
      <main className={c.pick}>
        {data.cards.length ? (
          <>
            <h2 className={c.pickTitle}>Pick a course</h2>
            <div className={cx(c.cards, css.navList)}>
              {data.cards.map((card) => (
                <CourseCard key={card.code} c={card} />
              ))}
            </div>
          </>
        ) : (
          <Empty title={data.note ? "Not in LMS yet" : "No courses here"}>{data.note ?? "Courses show up as soon as the registrar publishes your plan in LMS."}</Empty>
        )}
      </main>
    </div>
  );
}
