import { CourseList } from "./course/CourseList";
import c from "./course/course.module.css";
import type { CoursesData } from "./fixtures/types";
import { CourseCard, css, cx } from "./parts";

/** D4 Courses with nothing open yet: the list pane plus your courses as cards. */
export default function DesktopCourses({ data }: { data: CoursesData }) {
  return (
    <div className={cx(css.screen, c.layout, c.layoutPick)}>
      <CourseList courses={data.courses} terms={data.terms} current={null} />
      <main className={c.pick}>
        <h2 className={c.pickTitle}>Pick a course</h2>
        <p className={c.pickNote}>↑ ↓ or J K to move · Enter to open · / to filter</p>
        <div className={cx(c.cards, css.navList)}>
          {data.cards.map((card) => (
            <CourseCard key={card.code} c={card} />
          ))}
        </div>
      </main>
    </div>
  );
}
