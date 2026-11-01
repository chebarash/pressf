import Link from "next/link";
import { TeacherRow } from "@/components/Cards";
import { Pager, PER_PAGE } from "@/components/Pager";
import { getCatalog } from "@/lib/catalog";
import { faceMap, teacherLine } from "@/lib/content";
import { teacherRatings } from "@/lib/ratings";

export const metadata = { title: "Professors" };
type Props = { searchParams: Promise<{ q?: string; sort?: string; page?: string }> };

export default async function Professors({ searchParams }: Props) {
  const { q = "", sort = "best", page = "1" } = await searchParams;
  const catalog = await getCatalog();
  const [ratings, faces] = await Promise.all([teacherRatings(), faceMap()]);
  const needle = q.toLowerCase();
  const score = (id: string) => ratings.get(id)?.overall;
  const list = catalog.teachers.filter((t) => t.teaches.length > 0 || ratings.has(t.id)).filter((t) => !needle || `${t.name} ${t.display_name}`.toLowerCase().includes(needle));
  list.sort((a, b) => {
    if (sort === "az") return a.display_name.localeCompare(b.display_name);
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
      <p className="body-lg soft">Everyone teaching at NUU this term. Rated by students, anonymously.</p>
      <form className="search" style={{ cursor: "text" }}><input id="teacher-search" name="q" defaultValue={q} placeholder="Search by name" aria-label="Search professors" /></form>
      <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
        {[["best", "Best first"], ["worst", "Worst first"], ["az", "A to Z"]].map(([key, label]) => <Link key={key} className={`tab ${sort === key ? "on" : ""}`} href={`/professors?sort=${key}`}>{label}</Link>)}
      </div>
      <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>{list.slice((n - 1) * PER_PAGE, n * PER_PAGE).map((t) => <TeacherRow key={t.id} id={t.id} name={t.display_name} face={faces.get(t.id)} score={score(t.id)} meta={teacherLine(t)} />)}</div>
      <Pager page={n} pages={Math.ceil(list.length / PER_PAGE)} query={{ q: q || undefined, sort }} />
    </div>
  );
}
