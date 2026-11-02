import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ViewTransition } from "react";
import { FileRow, MentionCard, TeacherCard } from "@/components/Cards";
import { RatingPanel } from "@/components/Panels";
import { RateButton } from "@/components/RatePanel";
import { ShareButton } from "@/components/ShareButton";
import { SignInGate } from "@/components/SignInGate";
import { WeekList } from "@/components/WeekList";
import { SectionTabs } from "@/components/SectionTabs";
import { Arrow, Crumbs, Empty, SectionHead, Stat, Tag, viewName } from "@/components/ui";
import { currentWeek } from "@/lib/calendar";
import { findCourse, getCatalog, normalizeCode } from "@/lib/catalog";
import { courseDetails, faceMap, fileCounts, mentionsFor, programsWith, publishedFiles, resolveRequirement, schoolOfCourse, unlocks } from "@/lib/content";
import { getUser } from "@/lib/auth";
import { courseRatings, ownRatings, pairRatings, pickScores, strengths } from "@/lib/ratings";
import { isStated } from "@/lib/syllabus";

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ files?: string }> };
const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function generateMetadata({ params }: Props) {
  const { code } = await params;
  const course = findCourse(await getCatalog(), code);
  if (!course) return { title: "Course" };
  const [ratings, counts] = await Promise.all([courseRatings(), fileCounts()]);
  const rating = ratings.get(course.code);
  const files = counts.get(course.code) ?? 0;
  const description = [course.code, rating ? `Rated ${rating.overall.toFixed(1)} by students` : null, `${course.teachers.length} ${course.teachers.length === 1 ? "teacher" : "teachers"}`, files ? `${files} ${files === 1 ? "file" : "files"}` : null].filter(Boolean).join(" · ");
  return { title: course.subject, description, openGraph: { title: course.subject, description } };
}

const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)"];

export default async function CoursePage({ params, searchParams }: Props) {
  const { code: raw } = await params;
  const { files: kind } = await searchParams;
  const catalog = await getCatalog();
  const course = findCourse(catalog, raw);
  if (!course) notFound();
  if (raw !== course.code && normalizeCode(raw) === course.code) permanentRedirect(`/courses/${course.code}`);
  const code = course.code;

  const user = await getUser();
  const [mentioned, ratings, teacherScores, faces, opens] = await Promise.all([
    mentionsFor({ kind: "course", course }), courseRatings(), pairRatings(code), faceMap(), unlocks(code, catalog),
  ]);
  // Course details and files are for signed-in students; never fetched for guests.
  const [details, files] = user ? await Promise.all([courseDetails(code), publishedFiles(code)]) : [null, [] as Awaited<ReturnType<typeof publishedFiles>>];
  const own = user ? await ownRatings(user.id, { courseCode: code }) : [];
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
  const school = schoolOfCourse(code, catalog)[0];
  const exams = data?.assessment.filter((item) => /exam|midterm|final/i.test(item.name)).length ?? 0;
  const syllabusFile = files.find((file) => file.type === "syllabus");
  const shownFiles = files.filter((file) => !kind || file.type === kind);
  const kinds = [...new Set(files.flatMap((file) => file.type ?? []))];
  const lessonsOf = (id: string) => catalog.timetable.filter((lesson) => lesson.code === code && lesson.teacher === id);
  const instructors = new Map((data?.instructors ?? []).map((item) => [item.email.toLowerCase(), item]));

  return (
    <>
      <div className="wrap section" style={{ paddingBottom: 32 }}>
        <div className="row" style={{ "--gap": "32px", alignItems: "start", justifyContent: "space-between" } as React.CSSProperties}>
          <div className="stack grow" style={{ flexBasis: 420 }}>
            <Crumbs items={[["Courses", "/courses"], ...(school ? [[school.name.replace(/^School of /, "").split(",")[0], `/schools/${school.slug}`] as [string, string]] : []), [course.subject]]} />
            <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
              <Tag tone="accent-tag">{code}</Tag>
              {programs.length > 0 && <Tag>{programs.length} {programs.length === 1 ? "program" : "programs"}</Tag>}
            </div>
            <ViewTransition name={`course-${viewName(code)}`}><h1 className="d-title">{course.subject}</h1></ViewTransition>
            <div className="row" style={{ "--gap": "12px" } as React.CSSProperties}>
              <RateButton title={`Rate ${course.subject}`} subtitle={teachers.length === 1 ? `With ${teachers[0].display_name}. Other students never see who rated.` : undefined} pick="Who taught you?" signedIn={!!user} label="Rate this course" options={teachers.map((t) => { const given = own.find((row) => row.teacherId === t.id); return { teacherId: t.id, courseCode: code, label: t.display_name, face: faces.get(t.id) ?? null, given: given ? pickScores(given) : undefined }; })} />
              {syllabusFile && <a className="key btn" href={`/files/${syllabusFile.id}`} data-name={syllabusFile.fileName} target="_blank" rel="noreferrer">Syllabus</a>}
              <ShareButton query={course.code} title={course.subject} />
            </div>
            {data?.description && <p className="body-lg" style={{ maxWidth: "62ch", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{data.description}</p>}
          </div>
          <RatingPanel rating={ratings.get(code)} label="Rate this course to start" across={ratings.get(code)?.teachers} />
        </div>
        {(ects || data) && (
          <div className="row" style={{ "--gap": "48px" } as React.CSSProperties}>
            {ects && <Stat value={ects} label="ECTS" />}
            {data?.total_hours && <Stat value={data.total_hours} label="hours in a term" />}
            {contact > 0 && <Stat value={contact} label="class hours a week" />}
            {exams > 0 && <Stat value={exams} label="exams" />}
            {data && <span className="small soft" style={{ marginLeft: "auto" }}>From the {/\d{4}/.test(data.term) ? data.term : [data.term, data.academic_year].filter(Boolean).join(" ")} syllabus</span>}
          </div>
        )}
      </div>

      <div className="sticky-tabs"><SectionTabs label="Course sections" tabs={[
        { id: "overview", label: "Overview" },
        { id: "teachers", label: "Who teaches", count: teachers.length, unit: teachers.length === 1 ? "teacher" : "teachers" },
        { id: "files", label: "Files", count: files.length, unit: files.length === 1 ? "file" : "files" },
        ...(mentioned.length ? [{ id: "anonymous", label: "Anonymous", count: mentioned.length, unit: mentioned.length === 1 ? "post" : "posts" }] : []),
      ]} /></div>

      <div className="wrap">
        <section id="overview" className="section">
          {!user ? (
            <SignInGate title="Sign in to see course details" note="Grading, workload, weekly topics and books are available to NewUU students." lines={6} />
          ) : !data ? (
            <Empty title="No syllabus yet" action={<a className="key btn" href="https://t.me/pupressfbot" target="_blank" rel="noreferrer">Send it to our bot</a>}>Grading, workload and weekly topics appear here once someone shares the syllabus.</Empty>
          ) : (
            <div className="stack" style={{ "--gap": "48px" } as React.CSSProperties}>
              <div className="grid-2">
                {data.learning_outcomes.length > 0 && (
                  <div className="stack"><h2 className="d-sm">What you will learn</h2>
                    <ul className="stack" style={{ "--gap": "10px" } as React.CSSProperties}>{data.learning_outcomes.slice(0, 4).map((item) => <li key={item} className="row" style={{ alignItems: "start", flexWrap: "nowrap", "--gap": "10px" } as React.CSSProperties}><span className="accent">•</span><span>{item}</span></li>)}</ul>
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
          <div className="row between"><h2 className="d-md">Who teaches it</h2>{teachers.length > 0 && <span className="small soft">Scores here are for this course only.</span>}</div>
          {teachers.length === 0 ? <p className="soft">Not in the timetable this term.</p> : <div className="grid-2" style={{ gap: 24 }}>{teachers.map((t) => {
            const info = t.email ? instructors.get(t.email.toLowerCase()) : undefined;
            const office = [isStated(info?.office) && `Office ${info!.office}`, isStated(info?.office_hours) && info!.office_hours].filter(Boolean).join(", ");
            const lessons = lessonsOf(t.id);
            const days = [...new Set(lessons.map((l) => l.day))].sort().map((d) => DAY[d]).join(", ");
            return <TeacherCard key={t.id} id={t.id} name={t.display_name} face={faces.get(t.id)} score={teacherScores.get(t.id)?.overall} office={office} groups={[...new Set(lessons.map((l) => l.class))].slice(0, 3)} time={lessons[0] ? `${days} ${lessons[0].starts}–${lessons[0].ends}` : undefined} room={lessons[0]?.room} styles={strengths(teacherScores.get(t.id))} />;
          })}</div>}
        </section>

        <section id="files" className="section">
          {!user ? (
            <><SectionHead title="Files" /><SignInGate title="Sign in to see the files" note="Past exams, notes and solutions for this course are available to NewUU students." /></>
          ) : (<>
          <SectionHead title="Files" href={files.length > 5 ? `/files?q=${code}` : undefined} action={`All ${files.length} files`} />
          {kinds.length > 1 && <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
            <Link className={`chip small-chip ${!kind ? "on" : ""}`} href={`/courses/${code}#files`} scroll={false}>All {files.length}</Link>
            {kinds.map((item) => <Link key={item} className={`chip small-chip ${kind === item ? "on" : ""}`} href={`/courses/${code}?files=${item}#files`} scroll={false}>{item[0].toUpperCase() + item.slice(1)} {files.filter((file) => file.type === item).length}</Link>)}
          </div>}
          {files.length === 0 ? <Empty title="No files yet" action={<a className="key btn" href="https://t.me/pupressfbot" target="_blank" rel="noreferrer">Send on Telegram</a>}>Got past exams or notes? Send them to our bot.</Empty> : <div className="stack" style={{ "--gap": "12px" } as React.CSSProperties}>{shownFiles.slice(0, 5).map((file) => <FileRow key={file.id} file={file} />)}</div>}
          </>)}
        </section>
      </div>

      {mentioned.length > 0 && (
        <div className="band"><section id="anonymous" className="wrap section">
          <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}><SectionHead title="What Anonymous says" /><p className="soft">Anonymous posts, unverified. Press F never edits them and every card links to the original.</p></div>
          <div className="grid-3">{mentioned.slice(0, 3).map((m) => <MentionCard key={m.postId} mention={m} matched="Course" />)}</div>
          <Link className="ghost" href={`/posts?course=${code}`}>{mentioned.length === 1 ? "Read the full post" : `All ${mentioned.length} posts`}<Arrow /></Link>
        </section></div>
      )}
    </>
  );
}
