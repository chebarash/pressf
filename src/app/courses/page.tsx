import Link from "next/link";
import { CourseCard } from "@/components/Cards";
import { Pager, PER_PAGE } from "@/components/Pager";
import { PageSearch } from "@/components/ui";
import { getCatalog } from "@/lib/catalog";
import { courseCards, fileCounts, schoolOfCourse } from "@/lib/content";

export const metadata = { title: "Courses" };
type Props = { searchParams: Promise<{ q?: string; school?: string; show?: string; page?: string }> };

export default async function Courses({ searchParams }: Props) {
  const { q = "", school, show, page = "1" } = await searchParams;
  const catalog = await getCatalog();
  const counts = await fileCounts();
  const needle = q.toLowerCase();
  const files = (code: string) => counts.get(code) ?? 0;
  const list = catalog.courses.filter((c) =>
    (!needle || `${c.code} ${c.subject}`.toLowerCase().includes(needle)) &&
    (!school || schoolOfCourse(c.code, catalog).some((s) => s.slug === school)) &&
    (show !== "files" || files(c.code) > 0) && (show !== "term" || c.classes.length > 0)
  ).sort((a, b) => files(b.code) - files(a.code) || b.classes.length - a.classes.length || a.subject.localeCompare(b.subject));
  const n = Math.max(1, Number(page) || 1);
  const pages = Math.ceil(list.length / PER_PAGE);
  const cards = await courseCards(list.slice((n - 1) * PER_PAGE, n * PER_PAGE), catalog);
  const link = (next: { school?: string; show?: string }) => `/courses?${new URLSearchParams(Object.entries({ school, show, ...next }).filter((e): e is [string, string] => !!e[1]))}`;
  return (
    <div className="wrap section">
      <h1 className="d-title">Courses</h1>
      <p className="body-lg soft">Every course in the timetable and curricula, with who teaches it and the files that exist.</p>
      <div style={{ maxWidth: 800 }}><PageSearch value={q} placeholder={`Search ${catalog.courses.length} courses`} label="Search courses">{school && <input type="hidden" name="school" value={school} />}{show && <input type="hidden" name="show" value={show} />}</PageSearch></div>
      <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
        <Link className={`chip small-chip ${!school && !show ? "on" : ""}`} href="/courses">All</Link>
        {catalog.schools.map((s) => <Link key={s.slug} className={`chip small-chip ${school === s.slug ? "on" : ""}`} href={link({ school: school === s.slug ? undefined : s.slug })}>{s.name.replace(/^School of /, "").split(",")[0]}</Link>)}
        <Link className={`chip small-chip ${show === "files" ? "on" : ""}`} href={link({ show: show === "files" ? undefined : "files" })}>Has files</Link>
        <Link className={`chip small-chip ${show === "term" ? "on" : ""}`} href={link({ show: show === "term" ? undefined : "term" })}>This term</Link>
      </div>
      <div className="grid-3">{cards.map((card) => <CourseCard key={card.code} {...card} />)}</div>
      {!list.length && <p className="soft">Nothing found. Try a course code like MATH111.</p>}
      <Pager page={n} pages={pages} query={{ q: q || undefined, school, show }} />
    </div>
  );
}
