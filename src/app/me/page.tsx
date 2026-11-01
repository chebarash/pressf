import Link from "next/link";
import { redirect } from "next/navigation";
import { CourseCard, FileRow } from "@/components/Cards";
import { Banner, SectionHead } from "@/components/ui";
import { calendarHint, currentWeek } from "@/lib/calendar";
import { getCatalog } from "@/lib/catalog";
import { publishedFiles } from "@/lib/content";
import { currentGroup } from "@/lib/group";
import { courseRatings } from "@/lib/ratings";

export const metadata = { title: "My semester" };

export default async function MySemester() {
  const group = await currentGroup();
  if (!group) redirect("/me/group");
  const [catalog, ratings, files] = await Promise.all([getCatalog(), courseRatings(), publishedFiles()]);
  const info = catalog.groups.find((g) => g.class === group);
  const program = catalog.schools.flatMap((s) => s.programs).find((p) => p.slug === info?.program);
  const lessons = catalog.timetable.filter((l) => l.class === group);
  const today = (new Date().getDay() + 6) % 7;
  const todays = lessons.filter((l) => l.day === today).sort((a, b) => a.starts.localeCompare(b.starts));
  const codes = [...new Set(lessons.map((l) => l.code).filter((c): c is string => !!c))];
  const courses = codes.map((code) => catalog.courses.find((c) => c.code === code)).filter((c) => !!c);
  const mine = files.filter((f) => f.courseCode && codes.includes(f.courseCode)).slice(0, 3);
  const week = currentWeek();
  const hint = calendarHint();
  const label = [group, program && `${program.degree} ${program.name}`, info?.year && `Year ${info.year}`, week?.week && `Week ${week.week} of 16`].filter(Boolean).join(" · ");
  return (
    <div className="wrap section">
      <div className="row between"><div><h1 className="d-title">My semester</h1><Link className="soft" href="/calendar">{label}</Link></div><Link className="key btn sm" href="/me/group">Change group</Link></div>
      {hint && <Banner tone={hint.tone} href={hint.href} action={hint.action}>{hint.text}</Banner>}
      {!info?.program && <Banner action="Change group" href="/me/group">We do not have a curriculum for {group}, so next semester courses are not shown.</Banner>}
      <div className="grid-2">
        <div className="stack"><SectionHead title="Today" href="/timetable" action="Full week" />
          {todays.length ? todays.map((l) => <Link key={`${l.starts}${l.subject}`} className="class" href={l.code ? `/courses/${l.code}` : "/timetable"}><span className="label num">{l.starts}</span><span className="grow"><span className="label" style={{ display: "block" }}>{l.subject}</span><span className="small soft">{[l.teacher_name, l.room].filter(Boolean).join(" · ")}</span></span></Link>) : <p className="soft">No classes today.</p>}
        </div>
        {mine.length > 0 && <div className="stack"><SectionHead title="New for your courses" href="/files" action="All files" />{mine.map((file) => <FileRow key={file.id} file={file} />)}</div>}
      </div>
      {courses.length > 0 && <div className="stack"><h2 className="d-md">My courses</h2><div className="grid-3">{courses.map((c) => <CourseCard key={c.code} code={c.code} name={c.subject} score={ratings.get(c.code)?.overall} meta={`${c.teachers.length} ${c.teachers.length === 1 ? "teacher" : "teachers"}`} />)}</div></div>}
    </div>
  );
}
