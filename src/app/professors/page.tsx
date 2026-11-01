import Link from "next/link";
import { TeacherRow } from "@/components/Cards";
import { Pager, PER_PAGE } from "@/components/Pager";
import { PageSearch } from "@/components/ui";
import { getCatalog } from "@/lib/catalog";
import { faceMap, schoolOfCourse, teacherCourses, teacherLine } from "@/lib/content";
import { respectCounts, teacherRatings } from "@/lib/ratings";

export const metadata = { title: "Professors" };
type Props = { searchParams: Promise<{ q?: string; sort?: string; school?: string; page?: string }> };

export default async function Professors({ searchParams }: Props) {
  const { q = "", sort = "best", school, page = "1" } = await searchParams;
  const catalog = await getCatalog();
  const [ratings, faces, respects] = await Promise.all([teacherRatings(), faceMap(), respectCounts()]);
  const needle = q.toLowerCase();
  const score = (id: string) => ratings.get(id)?.overall;
  const list = catalog.teachers.filter((t) => t.teaches.length > 0 || ratings.has(t.id)).filter((t) => !needle || `${t.name} ${t.display_name}`.toLowerCase().includes(needle)).filter((t) => !school || t.teaches.some((code) => schoolOfCourse(code, catalog).some((s) => s.slug === school)));
  list.sort((a, b) => {
    if (sort === "az") return a.display_name.localeCompare(b.display_name);
    if (sort === "respected") return (respects.get(b.id) ?? 0) - (respects.get(a.id) ?? 0) || a.display_name.localeCompare(b.display_name);
    const x = score(a.id), y = score(b.id);
    if (x == null && y == null) return a.display_name.localeCompare(b.display_name);
    if (x == null) return 1;
    if (y == null) return -1;
    return sort === "worst" ? x - y : y - x;
  });
  const n = Math.max(1, Number(page) || 1);
  return (
    <div className="wrap section">
      <h1 className="d-title">Professors</h1>
      <p className="body-lg soft">Everyone teaching at NewUU this term. Rated by students, anonymously.</p>
      <div style={{ maxWidth: 800 }}><PageSearch value={q} placeholder={`Search ${list.length} teachers`} label="Search professors">{school && <input type="hidden" name="school" value={school} />}</PageSearch></div>
      <div className="filters">
      <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
        <Link className={`chip small-chip ${!school ? "on" : ""}`} href={`/professors?sort=${sort}`}>All schools</Link>
        {catalog.schools.map((s) => <Link key={s.slug} className={`chip small-chip ${school === s.slug ? "on" : ""}`} href={`/professors?sort=${sort}&school=${s.slug}`}>{s.name.replace(/^School of /, "").split(",")[0]}</Link>)}
      </div>
      <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
        {[["best", "Best first"], ["worst", "Worst first"], ["az", "A to Z"], ["respected", "Most respected"]].map(([key, label]) => <Link key={key} className={`tab ${sort === key ? "on" : ""}`} href={`/professors?sort=${key}${school ? `&school=${school}` : ""}`}>{label}</Link>)}
      </div>
      </div>
      <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>{list.slice((n - 1) * PER_PAGE, n * PER_PAGE).map((t) => <TeacherRow key={t.id} id={t.id} name={t.display_name} face={faces.get(t.id)} score={score(t.id)} meta={teacherLine(t)} courses={teacherCourses(t, catalog)} />)}</div>
      <Pager page={n} pages={Math.ceil(list.length / PER_PAGE)} query={{ q: q || undefined, sort, school }} />
    </div>
  );
}
