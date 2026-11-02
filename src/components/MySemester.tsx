import Link from "next/link";
import { CourseCard, FileRow, MentionCard } from "./Cards";
import { Banner, SectionHead } from "./ui";
import { calendarHint, currentWeek } from "@/lib/calendar";
import { getCatalog } from "@/lib/catalog";
import { courseCards, postsAboutCourses, publishedFiles } from "@/lib/content";
import type { Enrollment } from "@/lib/lms/enrollment";
import { studentTimetable } from "@/lib/lms/schedule";

const WEEKDAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Home for a signed-in student: their real semester from the LMS. */
export async function MySemester({ userId, enrollment }: { userId: string; enrollment: Enrollment }) {
  const [catalog, files, lessons] = await Promise.all([getCatalog(), publishedFiles(), studentTimetable(userId)]);
  const codes = enrollment.codes;
  const courses = codes.map((code) => catalog.courses.find((c) => c.code === code)).filter((c) => !!c);
  const [cards, posts] = await Promise.all([courseCards(courses, catalog), postsAboutCourses(codes, 3)]);

  const today = (new Date().getDay() + 6) % 7;
  const todays = (lessons ?? []).filter((l) => l.day === today).sort((a, b) => a.starts.localeCompare(b.starts));
  const mine = files.filter((f) => f.courseCode && codes.includes(f.courseCode)).slice(0, 3);
  const week = currentWeek();
  const hint = calendarHint(undefined, true);
  const label = [enrollment.semesterName, week?.week && `Week ${week.week} of 16`].filter(Boolean).join(" · ");

  return (
    <>
    <div className="wrap section">
      <div className="row between"><div><h1 className="d-title">My semester</h1><Link className="soft" href="/calendar">{label}</Link></div></div>
      {hint && <Banner tone={hint.tone} href={hint.href} action={hint.action}>{hint.text}</Banner>}
      <div className="grid-2">
        <div className="stack"><SectionHead title={`Today, ${WEEKDAY[today]}`} href="/timetable" action="Full week" />
          {todays.length ? todays.map((l) => <Link key={`${l.starts}${l.subject}`} className="class" href={l.code ? `/courses/${l.code}` : "/timetable"}><span className="label num">{l.starts}</span><span className="grow"><span className="label" style={{ display: "block" }}>{l.subject}</span><span className="small soft">{[l.teacher_name, l.room].filter(Boolean).join(" · ")}</span></span></Link>) : <p className="soft">No classes today.</p>}
        </div>
        {mine.length > 0 && <div className="stack"><SectionHead title="New for your courses" href="/files" action="All files" />{mine.map((file) => <FileRow key={file.id} file={file} />)}</div>}
      </div>
      {cards.length > 0 && <div className="stack"><SectionHead title="My courses" /><div className="grid-3">{cards.map((card) => <CourseCard key={card.code} {...card} />)}</div></div>}
    </div>
    {posts.length > 0 && (
      <div className="band"><section className="wrap section">
        <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}><SectionHead title="Anonymous on your courses" href="/posts" action="All posts" /><p className="soft">Unverified posts. Every card links to the original.</p></div>
        <div className="grid-3">{posts.map((post) => <MentionCard key={post.postId} mention={post} matched="Course" />)}</div>
      </section></div>
    )}
    </>
  );
}
