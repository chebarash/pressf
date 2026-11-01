import Link from "next/link";
import { CourseCard, FileRow, TeacherRow } from "@/components/Cards";
import { Palette } from "@/components/Palette";
import { Arrow, Banner, SectionHead, Stat } from "@/components/ui";
import { calendarHint } from "@/lib/calendar";
import { getCatalog } from "@/lib/catalog";
import { faceMap, popularCourses, publishedFiles, teacherLine } from "@/lib/content";
import { courseRatings, teacherRatings } from "@/lib/ratings";

const TINT: Record<string, string> = { computing: "computing", engineering: "engineering", management: "management", humanities: "humanities", medicine: "medicine" };

export default async function Home() {
  const catalog = await getCatalog();
  const [popular, files, cScores, tScores, faces] = await Promise.all([popularCourses(catalog), publishedFiles(), courseRatings(), teacherRatings(), faceMap()]);
  const best = catalog.teachers.filter((t) => tScores.get(t.id)).sort((a, b) => tScores.get(b.id)!.overall - tScores.get(a.id)!.overall).slice(0, 3);
  const hint = calendarHint();
  return (
    <>
      <div className="hero-cover">
        <section className="wrap section" style={{ paddingTop: 16 }}>
          <h1 className="d-hero">
            <span className="row" style={{ "--gap": ".18em" } as React.CSSProperties}>Press <span className="key cap lg" aria-hidden="true" style={{ cursor: "default" }}>F</span> to pay</span>
            <em className="accent" style={{ display: "block" }}>respects</em>
          </h1>
          <p className="body-lg" style={{ maxWidth: "52ch" }}>Not all heroes wear capes… Some just teach really well. Everything about NewUU courses, from the people who took them.</p>
          <div style={{ maxWidth: 800 }}><Palette variant="bar" /></div>
          {hint && <div style={{ maxWidth: 800 }}><Banner tone={hint.tone} href={hint.href} action={hint.action}>{hint.text}</Banner></div>}
          <div className="row" style={{ "--gap": "48px" } as React.CSSProperties}>
            <Stat value={catalog.schools.length} label="schools" />
            <Stat value={catalog.courses.length} label="courses" />
            <Stat value={catalog.teachers.length} label="teachers" />
          </div>
        </section>
      </div>
      <div className="wrap">
        <section id="schools" className="section">
          <h2 className="d-md">Start with your school</h2>
          <div className="grid-3">
            {catalog.schools.map((school) => (
              <Link key={school.slug} className={`card school ${TINT[school.slug] ?? ""}`} href={`/schools/${school.slug}`}>
                <div><div className="caps">School of</div><h3 className="d-sm">{school.name.replace(/^School of /, "")}</h3></div>
                <div className="row between"><span className="small grow">{school.programs.map((p) => p.name).join(", ")}</span><Arrow /></div>
              </Link>
            ))}
            <Link className="card school" href="/courses" style={{ background: "var(--inverse)", color: "var(--text-inv)" }}>
              <div><div className="caps">Not sure yet?</div><h3 className="d-sm">Browse every course</h3></div>
              <span className="small">{catalog.courses.length} courses, A to Z</span>
            </Link>
          </div>
        </section>
        <section className="section">
          <SectionHead title="Most searched this week" href="/courses" action="All courses" />
          <div className="grid-3">{popular.map((c) => <CourseCard key={c.code} code={c.code} name={c.subject} score={cScores.get(c.code)?.overall} meta={`${c.teachers.length} ${c.teachers.length === 1 ? "teacher" : "teachers"}`} />)}</div>
        </section>
        {files.length > 0 && (
          <section className="section">
            <SectionHead title="Fresh from students" href="/files" action="All files" />
            <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>{files.slice(0, 4).map((file) => <FileRow key={file.id} file={file} />)}</div>
          </section>
        )}
        {best.length > 0 && (
          <section className="section">
            <SectionHead title="The best" href="/professors" action="All professors" />
            <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>{best.map((t) => <TeacherRow key={t.id} id={t.id} name={t.display_name} face={faces.get(t.id)} score={tScores.get(t.id)?.overall} meta={teacherLine(t)} />)}</div>
          </section>
        )}
      </div>
    </>
  );
}
