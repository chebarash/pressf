import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseCard } from "@/components/Cards";
import { Stat } from "@/components/ui";
import { getCatalog } from "@/lib/catalog";
import { courseRatings } from "@/lib/ratings";

type Props = { params: Promise<{ slug: string }> };

export default async function SchoolPage({ params }: Props) {
  const { slug } = await params;
  const catalog = await getCatalog();
  const school = catalog.schools.find((s) => s.slug === slug);
  if (!school) notFound();
  const ratings = await courseRatings();
  const codes = new Set(school.programs.flatMap((p) => catalog.curricula[p.slug]?.semesters.flatMap((s) => s.courses.map((c) => c.code)) ?? []));
  const courses = catalog.courses.filter((c) => codes.has(c.code));
  const top = [...courses].sort((a, b) => b.classes.length - a.classes.length).slice(0, 6);
  return (
    <>
      <div className={`school ${slug}`} style={{ paddingBlock: 48 }}>
        <div className="wrap stack" style={{ "--gap": "24px" } as React.CSSProperties}>
          <h1 className="d-title">{school.name}</h1>
          <div className="row" style={{ "--gap": "48px" } as React.CSSProperties}><Stat value={school.programs.length} label="programs" /><Stat value={courses.length} label="courses" /></div>
        </div>
      </div>
      <div className="wrap">
        <section className="section"><h2 className="d-md">Programs</h2>
          <div className="grid-3">{school.programs.map((p) => (
            <Link key={p.slug} className="card" href={`/programs/${p.slug}/curriculum`}>
              <div><div className="caps accent">{p.degree}</div><h3 className="d-sm">{p.name}</h3></div>
              <span className="small soft">{catalog.curricula[p.slug]?.semesters.length ? `${catalog.curricula[p.slug].semesters.length} semesters` : "Curriculum only in a PDF"}</span>
            </Link>
          ))}</div>
        </section>
        {top.length > 0 && <section className="section"><h2 className="d-md">Courses students take most</h2><div className="grid-3">{top.map((c) => <CourseCard key={c.code} code={c.code} name={c.subject} score={ratings.get(c.code)?.overall} meta={`${c.teachers.length} ${c.teachers.length === 1 ? "teacher" : "teachers"}`} />)}</div></section>}
      </div>
    </>
  );
}
