import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseCard, ProfessorCard } from "@/components/Cards";
import { Arrow, Crumbs, SectionHead, Stat } from "@/components/ui";
import { getCatalog } from "@/lib/catalog";
import { courseCards, faceMap, fileCounts } from "@/lib/content";
import { teacherRatings } from "@/lib/ratings";

type Props = { params: Promise<{ slug: string }> };

export default async function SchoolPage({ params }: Props) {
  const { slug } = await params;
  const catalog = await getCatalog();
  const school = catalog.schools.find((s) => s.slug === slug);
  if (!school) notFound();
  const [scores, faces, counts] = await Promise.all([teacherRatings(), faceMap(), fileCounts()]);
  const codes = new Set(school.programs.flatMap((p) => catalog.curricula[p.slug]?.semesters.flatMap((s) => s.courses.map((c) => c.code)) ?? []));
  const courses = catalog.courses.filter((c) => codes.has(c.code));
  const top = [...courses].sort((a, b) => b.classes.length - a.classes.length).slice(0, 3);
  const cards = await courseCards(top, catalog);
  const teachers = catalog.teachers.filter((t) => t.teaches.some((code) => codes.has(code)));
  const shown = [...teachers].sort((a, b) => (scores.get(b.id)?.overall ?? 0) - (scores.get(a.id)?.overall ?? 0)).slice(0, 4);
  const files = [...codes].reduce((sum, code) => sum + (counts.get(code) ?? 0), 0);
  return (
    <>
      <div className={`school ${slug}`} style={{ paddingBlock: 32 }}>
        <div className="wrap stack" style={{ "--gap": "16px" } as React.CSSProperties}>
          <Crumbs items={[["Schools", "/schools"], [school.name.replace(/^School of /, "")]]} />
          <h1 className="d-title">{school.name}</h1>
          <div className="row" style={{ "--gap": "48px" } as React.CSSProperties}>
            <Stat value={school.programs.length} label="programs" /><Stat value={courses.length} label="courses" /><Stat value={teachers.length} label="teachers" />{files > 0 && <Stat value={files} label="course files" />}
          </div>
        </div>
      </div>
      <div className="wrap">
        <section className="section"><h2 className="d-md">Programs</h2>
          <div className="grid-3">{school.programs.map((p) => {
            const semesters = catalog.curricula[p.slug]?.semesters ?? [];
            const total = new Set(semesters.flatMap((s) => s.courses.map((c) => c.code))).size;
            return (
              <div key={p.slug} className="card">
                <div><div className="caps accent">{p.degree}</div><h3 className="d-sm">{p.name}</h3><div className="small soft">{semesters.length ? `${semesters.length} semesters · ${total} courses` : "Curriculum only in a PDF"}</div></div>
                <div><Link className="key btn sm" href={`/programs/${p.slug}/curriculum`}>See curriculum<Arrow /></Link></div>
              </div>
            );
          })}</div>
        </section>
        {cards.length > 0 && <section className="section"><SectionHead title="Courses students open first" href={`/courses?school=${slug}`} action={`All ${courses.length} courses`} /><div className="grid-3">{cards.map((card) => <CourseCard key={card.code} {...card} />)}</div></section>}
        {shown.length > 0 && <section className="section"><SectionHead title="Teachers" href={`/professors?school=${slug}`} action={`All ${teachers.length} teachers`} /><div className="grid-4">{shown.map((t) => <ProfessorCard key={t.id} id={t.id} name={t.display_name} face={faces.get(t.id)} score={scores.get(t.id)?.overall} meta={t.department?.replace(/^Department of /, "") ?? "Staff"} />)}</div></section>}
      </div>
    </>
  );
}
