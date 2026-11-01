import Link from "next/link";
import { CourseCard, FileRow, MentionCard, TeacherRow } from "@/components/Cards";
import { MySemester } from "@/components/MySemester";
import { Palette } from "@/components/Palette";
import { SchoolCards } from "@/components/SchoolCards";
import { Arrow, Banner, SectionHead, Stat } from "@/components/ui";
import { calendarHint } from "@/lib/calendar";
import { getCatalog } from "@/lib/catalog";
import { channelPosts, courseCards, faceMap, fileCounts, popularCourses, publishedFiles, teacherCourses, teacherLine } from "@/lib/content";
import { currentGroup } from "@/lib/group";
import { teacherRatings } from "@/lib/ratings";

type Props = { searchParams: Promise<{ list?: string }> };

export default async function Home({ searchParams }: Props) {
  const group = await currentGroup();
  if (group) return <MySemester group={group} />;
  const { list } = await searchParams;
  const worst = list === "worst";
  const catalog = await getCatalog();
  const [popular, files, tScores, faces, posts, counts] = await Promise.all([popularCourses(catalog), publishedFiles(), teacherRatings(), faceMap(), channelPosts("", 3), fileCounts()]);
  const cards = await courseCards(popular, catalog);
  const rated = catalog.teachers.filter((t) => tScores.get(t.id)).sort((a, b) => tScores.get(b.id)!.overall - tScores.get(a.id)!.overall);
  const best = (worst ? [...rated].reverse() : rated).slice(0, 3);
  const totalFiles = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const hint = calendarHint();
  return (
    <>
      <div className="hero-cover">
        <section className="wrap section" style={{ paddingTop: 48 }}>
          <h1 className="d-hero">
            <span className="row" style={{ "--gap": ".18em" } as React.CSSProperties}><span className="word" style={{ "--i": 0 } as React.CSSProperties}>Press</span> <span className="key cap lg drop" aria-hidden="true" style={{ cursor: "default" }}>F</span> <span className="word" style={{ "--i": 1 } as React.CSSProperties}>to</span> <span className="word" style={{ "--i": 2 } as React.CSSProperties}>pay</span></span>
            <em className="accent word" style={{ display: "block", "--i": 3 } as React.CSSProperties}>respects</em>
          </h1>
          <p className="body-lg" style={{ maxWidth: "52ch" }}>Not all heroes wear capes… Some just teach really well. Everything about NewUU courses, from the people who took them.</p>
          <div style={{ maxWidth: 800 }}><Palette variant="bar" /></div>
          <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
            <span className="small soft">People look for</span>
            {popular.map((c) => <Link key={c.code} className="chip small-chip" href={`/courses/${c.code}`}>{c.subject}</Link>)}
          </div>
          {hint && <div style={{ maxWidth: 800 }}><Banner tone={hint.tone} href={hint.href} action={hint.action}>{hint.text}</Banner></div>}
          <div className="row" style={{ "--gap": "48px" } as React.CSSProperties}>
            <Stat value={catalog.schools.length} label="schools" />
            <Stat value={catalog.courses.length} label="courses" />
            <Stat value={catalog.teachers.length} label="teachers" />
            {totalFiles > 0 && <Stat value={totalFiles} label="course files" />}
          </div>
        </section>
      </div>
      <div className="wrap">
        <section id="schools" className="section">
          <h2 className="d-md">Start with your school</h2>
          <div className="grid-3">
            <SchoolCards schools={catalog.schools} />
            <Link className="card school" href="/courses" style={{ background: "var(--inverse)", color: "var(--text-inv)" }}>
              <div><div className="caps">Not sure yet?</div><h3 className="d-sm">Browse every course</h3></div>
              <span className="small">{catalog.courses.length} courses, A to Z</span>
            </Link>
          </div>
        </section>
        <section className="section">
          <SectionHead title="Most searched this week" href="/courses" action="All courses" />
          <div className="grid-3">{cards.map((card) => <CourseCard key={card.code} {...card} />)}</div>
        </section>
        {files.length > 0 && (
          <section className="section">
            <SectionHead title="Fresh from students" href="/files" action="All files" />
            <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>{files.slice(0, 4).map((file) => <FileRow key={file.id} file={file} />)}</div>
          </section>
        )}
        {best.length > 0 && (
          <section className="section">
            <div className="row between">
              <div className="row"><h2 className="d-md">{worst ? "The worst" : "The best"}</h2><Link className="chip small-chip" scroll={false} href={worst ? "/" : "/?list=worst"}>{worst ? "or see the best" : "or avoid the worst"}</Link></div>
              <Link className="ghost" href="/professors">All professors<Arrow /></Link>
            </div>
            <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>{best.map((t) => <TeacherRow key={t.id} id={t.id} name={t.display_name} face={faces.get(t.id)} score={tScores.get(t.id)?.overall} meta={teacherLine(t)} courses={teacherCourses(t, catalog)} />)}</div>
          </section>
        )}
      </div>
      {posts.total > 0 && (
        <div className="band"><section className="wrap section">
          <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}><SectionHead title="What Anonymous says" href="/posts" action={`All ${posts.total} posts`} /><p className="soft">Posts from the anonymous channel, matched by course and name. Not verified. Every card links to the original.</p></div>
          <div className="grid-3">{posts.items.map((m) => <MentionCard key={m.postId} mention={m} />)}</div>
        </section></div>
      )}
    </>
  );
}
