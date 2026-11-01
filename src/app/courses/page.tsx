import Link from "next/link";
import { CourseCard } from "@/components/Cards";
import { Pager, PER_PAGE } from "@/components/Pager";
import { getCatalog } from "@/lib/catalog";
import { schoolOfCourse } from "@/lib/content";
import { courseRatings } from "@/lib/ratings";

export const metadata = { title: "Courses" };
type Props = { searchParams: Promise<{ q?: string; school?: string; page?: string }> };

export default async function Courses({ searchParams }: Props) {
  const { q = "", school, page = "1" } = await searchParams;
  const catalog = await getCatalog();
  const ratings = await courseRatings();
  const needle = q.toLowerCase();
  const list = catalog.courses.filter((c) =>
    (!needle || `${c.code} ${c.subject}`.toLowerCase().includes(needle)) &&
    (!school || schoolOfCourse(c.code, catalog).some((s) => s.slug === school)));
  const n = Math.max(1, Number(page) || 1);
  const pages = Math.ceil(list.length / PER_PAGE);
  return (
    <div className="wrap section">
      <h1 className="d-title">Courses</h1>
      <p className="body-lg soft">Every course in the timetable and curricula.</p>
      <form className="search" style={{ cursor: "text" }}><input id="course-search" name="q" defaultValue={q} placeholder={`Search ${catalog.courses.length} courses`} aria-label="Search courses" />{school && <input type="hidden" name="school" value={school} />}</form>
      <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
        <Link className={`chip ${!school ? "on" : ""}`} href="/courses">All</Link>
        {catalog.schools.map((s) => <Link key={s.slug} className={`chip ${school === s.slug ? "on" : ""}`} href={`/courses?school=${s.slug}`}>{s.name.replace(/^School of /, "").split(",")[0]}</Link>)}
      </div>
      <div className="grid-3">{list.slice((n - 1) * PER_PAGE, n * PER_PAGE).map((c) => <CourseCard key={c.code} code={c.code} name={c.subject} score={ratings.get(c.code)?.overall} meta={c.teachers.length ? `${c.teachers.length} ${c.teachers.length === 1 ? "teacher" : "teachers"}` : "Not in this term's timetable"} />)}</div>
      {!list.length && <p className="soft">Nothing found. Try a course code like MATH111.</p>}
      <Pager page={n} pages={pages} query={{ q: q || undefined, school }} />
    </div>
  );
}
