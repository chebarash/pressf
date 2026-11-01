import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { FileRow, MentionCard, TeacherRow } from "@/components/Cards";
import { RatingPanel } from "@/components/Panels";
import { WeekList } from "@/components/WeekList";
import { Banner, Empty, SectionHead, Stat, Tag } from "@/components/ui";
import { currentWeek } from "@/lib/calendar";
import { findCourse, getCatalog, normalizeCode } from "@/lib/catalog";
import { courseDetails, faceMap, mentionsFor, programsWith, publishedFiles, resolveRequirement, teacherLine, unlocks } from "@/lib/content";
import { courseRatings, teacherRatings } from "@/lib/ratings";
import { isStated } from "@/lib/syllabus";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props) {
  const { code } = await params;
  const course = findCourse(await getCatalog(), code);
  return { title: course?.subject ?? "Course" };
}

const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];

export default async function CoursePage({ params }: Props) {
  const { code: raw } = await params;
  const catalog = await getCatalog();
  const course = findCourse(catalog, raw);
  if (!course) notFound();
  if (raw !== course.code && normalizeCode(raw) === course.code) permanentRedirect(`/courses/${course.code}`);
  const code = course.code;

  const [details, files, mentioned, ratings, teacherScores, faces, opens] = await Promise.all([
    courseDetails(code), publishedFiles(code), mentionsFor("course", code), courseRatings(), teacherRatings(), faceMap(), unlocks(code, catalog),
  ]);
  const data = details?.data;
  const teachers = course.teachers.map((id) => catalog.teachers.find((t) => t.id === id)).filter((t) => !!t);
  const programs = programsWith(code, catalog);
  const ects = catalog.schools.flatMap((s) => s.programs).flatMap((p) => catalog.curricula[p.slug]?.semesters.flatMap((s) => s.courses) ?? []).find((c) => c.code === code)?.credits ?? data?.ects ?? null;
  const week = currentWeek();
  const sameTerm = data && week && new RegExp(week.term, "i").test(data.term);
  const contact = data ? (data.contact_hours_per_week.lectures ?? 0) + (data.contact_hours_per_week.tutorials ?? 0) + (data.contact_hours_per_week.labs ?? 0) : 0;
  const work = (data?.workload ?? []).filter((item) => item.hours > 0);
  const workTotal = work.reduce((a, b) => a + b.hours, 0);
  const requirements = data?.prerequisites.groups.map((group) => group.any_of.map((item) => resolveRequirement(item, catalog.courses))) ?? [];
  const instructors = new Map((data?.instructors ?? []).map((item) => [item.email.toLowerCase(), item]));

  return (
    <>
      <div className="wrap section" style={{ paddingBottom: 32 }}>
        <div className="row" style={{ "--gap": "32px", alignItems: "start", justifyContent: "space-between" } as React.CSSProperties}>
          <div className="stack grow" style={{ flexBasis: 420 }}>
            <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
              <Tag tone="accent-tag">{code}</Tag>
              {programs.length > 0 && <Tag>{programs.length} {programs.length === 1 ? "program" : "programs"}</Tag>}
            </div>
            <h1 className="d-title">{course.subject}</h1>
            {data?.description && <p className="body-lg" style={{ maxWidth: "62ch", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{data.description}</p>}
          </div>
          <RatingPanel rating={ratings.get(code)} label="Rate a teacher to start" />
        </div>
        {(ects || data) && (
          <div className="row" style={{ "--gap": "48px" } as React.CSSProperties}>
            {ects && <Stat value={ects} label="ECTS" />}
            {data?.total_hours && <Stat value={data.total_hours} label="hours in a term" />}
            {contact > 0 && <Stat value={contact} label="class hours a week" />}
            {data && <span className="small soft" style={{ marginLeft: "auto" }}>From the {/\d{4}/.test(data.term) ? data.term : [data.term, data.academic_year].filter(Boolean).join(" ")} syllabus</span>}
          </div>
        )}
      </div>

      <div className="sticky-tabs"><nav className="wrap tabs" aria-label="Course sections">
        <a className="tab on" href="#overview">Overview</a>
        <a className="tab" href="#teachers">Who teaches</a>
        <a className="tab" href="#files">Files{files.length ? ` ${files.length}` : ""}</a>
        {mentioned.total > 0 && <a className="tab" href="#anonymous">Anonymous {mentioned.total}</a>}
      </nav></div>

      <div className="wrap">
        <section id="overview" className="section">
          {!data ? (
            <Empty title="No syllabus yet" action={<a className="key btn" href="https://t.me/pupressfbot" target="_blank" rel="noreferrer">Send it to our bot</a>}>Grading, workload and weekly topics appear here once someone shares the syllabus.</Empty>
          ) : (
            <div className="stack" style={{ "--gap": "48px" } as React.CSSProperties}>
              <div className="grid-2">
                {data.learning_outcomes.length > 0 && (
                  <div className="stack"><h2 className="d-sm">What you will learn</h2>
                    <ul className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>{data.learning_outcomes.slice(0, 5).map((item) => <li key={item} className="row" style={{ alignItems: "start", flexWrap: "nowrap", "--gap": "10px" } as React.CSSProperties}><span className="accent">•</span><span>{item}</span></li>)}</ul>
                  </div>
                )}
                {data.assessment.length > 0 && (
                  <div className="stack"><h2 className="d-sm">How it is graded</h2>
                    {data.assessment.map((item) => (
                      <div key={item.name} className="row" style={{ flexWrap: "nowrap" }}>
                        <span className="d-xs num" style={{ width: 64 }}>{item.weight_percent != null ? `${item.weight_percent}%` : "–"}</span>
                        <div><div className="label">{item.name}</div>{isStated(item.timing) && <div className="small soft">{item.timing}</div>}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {work.length > 0 && (
                <div className="stack"><div className="row" style={{ alignItems: "baseline" }}><h2 className="d-sm">Workload</h2><span className="small soft">{workTotal} hours in a term, about {Math.round(workTotal / 15)} a week</span></div>
                  <div className="work-bar">{work.map((item, i) => <span key={item.activity} style={{ flexGrow: item.hours, background: COLORS[i % 5] }} />)}</div>
                  <div className="row" style={{ "--gap": "8px 20px" } as React.CSSProperties}>{work.map((item, i) => <span key={item.activity} className="row small soft" style={{ "--gap": "6px" } as React.CSSProperties}><span className="dot" style={{ background: COLORS[i % 5] }} />{item.activity} {item.hours} h</span>)}</div>
                </div>
              )}
              <div className="grid-2">
                {data.topics_by_week.length > 0 && <div className="stack"><h2 className="d-sm">Week by week</h2><WeekList weeks={data.topics_by_week} current={sameTerm ? (week?.week ?? null) : null} /></div>}
                <div className="stack" style={{ "--gap": "48px" } as React.CSSProperties}>
                  {data.books.length > 0 && (
                    <div className="stack"><h2 className="d-sm">Books</h2>
                      {data.books.slice(0, 4).map((book) => <div key={book.title} className="row between"><div className="grow"><div className="label">{book.title}</div><div className="small soft">{[book.authors, book.edition].filter(Boolean).join(", ")}</div></div><Tag tone={book.kind === "required" ? "accent-tag" : ""}>{book.kind}</Tag></div>)}
                    </div>
                  )}
                  {(data.prerequisites.status !== "not_stated" || opens.length > 0) && (
                    <div className="stack"><h2 className="d-sm">Where it fits</h2>
                      {data.prerequisites.status === "none" && <p className="label">No prerequisites</p>}
                      {requirements.length > 0 && <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}><span className="label-sm soft" style={{ width: 64 }}>Needs</span>{requirements.map((group) => group.map((item) => item.code ? <Link key={item.text} className="chip" href={`/courses/${item.code}`}>{item.text}</Link> : <span key={item.text} className="small">{item.text}</span>))}</div>}
                      {opens.length > 0 && <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}><span className="label-sm soft" style={{ width: 64 }}>Unlocks</span>{opens.map((item) => <Link key={item.code} className="chip" href={`/courses/${item.code}`}>{item.subject}</Link>)}</div>}
                      <p className="small soft">Requirements come from syllabi. Check with your advisor.</p>
                    </div>
                  )}
                  {(data.attendance_policy || data.late_work_policy) && <div className="stack"><h2 className="d-sm">Rules</h2>{data.attendance_policy && <p>{data.attendance_policy}</p>}{data.late_work_policy && <p>{data.late_work_policy}</p>}</div>}
                  {data.tools.length > 0 && <div className="stack"><h2 className="d-sm">Tools</h2><div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>{data.tools.map((tool) => <Tag key={tool}>{tool}</Tag>)}</div></div>}
                </div>
              </div>
            </div>
          )}
        </section>

        <section id="teachers" className="section">
          <h2 className="d-md">Who teaches it</h2>
          {teachers.length === 0 ? <p className="soft">Not in the timetable this term.</p> : teachers.map((t) => {
            const info = t.email ? instructors.get(t.email.toLowerCase()) : undefined;
            const office = [isStated(info?.office) && `Office ${info!.office}`, isStated(info?.office_hours) && info!.office_hours].filter(Boolean).join(", ");
            return <TeacherRow key={t.id} id={t.id} name={t.display_name} face={faces.get(t.id)} score={teacherScores.get(t.id)?.overall} meta={office || teacherLine(t)} />;
          })}
        </section>

        <section id="files" className="section">
          <h2 className="d-md">Files</h2>
          {files.length === 0 ? <Empty title="No files yet" action={<a className="key btn" href="https://t.me/pupressfbot" target="_blank" rel="noreferrer">Send on Telegram</a>}>Got past exams or notes? Send them to our bot.</Empty> : <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>{files.map((file) => <FileRow key={file.id} file={file} />)}</div>}
        </section>
      </div>

      {mentioned.total > 0 && (
        <div className="band"><section id="anonymous" className="wrap section">
          <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}><SectionHead title="What Anonymous says" /><p className="soft">Anonymous posts, unverified. Press F never edits them and every card links to the original.</p></div>
          <div className="grid-3">{mentioned.items.map((m) => <MentionCard key={m.postId} mention={m} />)}</div>
          {mentioned.total > 3 && <Banner>{mentioned.total} posts mention this course.</Banner>}
        </section></div>
      )}
    </>
  );
}
