import { ViewTransition } from "react";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { MentionCard } from "@/components/Cards";
import { RatingPanel } from "@/components/Panels";
import { RateButton, RespectButton } from "@/components/RatePanel";
import { Arrow, Face, SectionHead } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { findTeacher, getCatalog } from "@/lib/catalog";
import { faceMap, mentionsFor } from "@/lib/content";
import { db } from "@/lib/db";
import { syllabi, teacherAliases } from "@/lib/db/schema";
import { respectCount, teacherRatings } from "@/lib/ratings";
import { isStated, termRank } from "@/lib/syllabus";

type Props = { params: Promise<{ id: string }> };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return { title: findTeacher(await getCatalog(), id)?.display_name ?? "Professor" };
}

export default async function ProfessorPage({ params }: Props) {
  const id = decodeURIComponent((await params).id);
  const catalog = await getCatalog();
  const teacher = findTeacher(catalog, id);
  if (!teacher) {
    const [alias] = await db().select().from(teacherAliases).where(eq(teacherAliases.oldId, id));
    if (alias) permanentRedirect(`/professors/${alias.teacherId}`);
    notFound();
  }
  const [user, ratings, respects, mentioned, faces, rows] = await Promise.all([
    getUser(), teacherRatings(), respectCount(id), mentionsFor({ kind: "teacher", teacher }), faceMap(), db().select().from(syllabi).where(eq(syllabi.matched, true)),
  ]);
  const courses = teacher.teaches.map((code) => catalog.courses.find((c) => c.code === code)).filter((c) => !!c);
  const lessons = catalog.timetable.filter((l) => l.teacher === id);
  const seen = new Set<string>();
  const slots = lessons.filter((l) => { const k = `${l.day}${l.starts}${l.code}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.day - b.day || a.starts.localeCompare(b.starts));
  const email = teacher.email?.toLowerCase();
  const fromSyllabus = rows.sort((a, b) => termRank(b.data) - termRank(a.data)).flatMap((row) => row.data.instructors.filter((i) => i.email.toLowerCase() === email).map((i) => ({ ...i, term: row.data.term }))).find((i) => isStated(i.office) || isStated(i.office_hours));
  const office = teacher.office ?? (isStated(fromSyllabus?.office) ? fromSyllabus!.office : null);

  return (
    <>
      <div className="wrap section">
        <div className="row prof-head">
          <ViewTransition name={`face-${id}`}><Face name={teacher.display_name} src={faces.get(id)} size={240} className="face-lg" /></ViewTransition>
          <div className="stack grow" style={{ flexBasis: 320 }}>
            <ViewTransition name={`name-${id}`}><h1 className="d-title">{teacher.display_name}</h1></ViewTransition>
            <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
              {(teacher.department ?? teacher.position) && <div className="label">{teacher.department ?? teacher.position}</div>}
              {teacher.email && <div className="soft">{teacher.email}</div>}
              {office && <div className="soft">Office {office}</div>}
              {fromSyllabus && isStated(fromSyllabus.office_hours) && <div className="small soft">Office hours by syllabus: {fromSyllabus.office_hours}</div>}
            </div>
            <div className="row" style={{ "--gap": "32px" } as React.CSSProperties}>
              <RespectButton teacherId={id} count={respects} signedIn={!!user} />
              <RateButton teacherId={id} name={teacher.display_name} courses={courses.map((c) => ({ code: c.code, subject: c.subject }))} signedIn={!!user} label="Rate this professor" />
            </div>
          </div>
        </div>
      </div>
      <div className="wrap grid-2" style={{ paddingBottom: 64 }}>
        <RatingPanel rating={ratings.get(id)} />
        <div className="stack" style={{ "--gap": "48px" } as React.CSSProperties}>
          {courses.length > 0 && <div className="stack"><h2 className="d-sm">Courses</h2><div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>{courses.map((c) => <Link key={c.code} className="chip" href={`/courses/${c.code}`}>{c.subject}</Link>)}</div></div>}
          {slots.length > 0 && <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}><h2 className="d-sm">This term</h2>{slots.map((l) => <div key={`${l.day}${l.starts}${l.code}`} className="row" style={{ padding: "10px 0", borderBottom: "2px solid var(--subtle)", flexWrap: "nowrap" }}><span className="label" style={{ width: 44 }}>{DAYS[l.day]}</span><span className="num" style={{ width: 56 }}>{l.starts}</span><span className="grow">{l.subject}</span><span className="small soft">{l.room}</span></div>)}</div>}
        </div>
      </div>
      {mentioned.length > 0 && (
        <div className="band"><section className="wrap section">
          <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}><SectionHead title="What Anonymous says" /><p className="soft">Anonymous posts, unverified. Press F never edits them and every card links to the original.</p></div>
          <div className="grid-3">{mentioned.slice(0, 3).map((m) => <MentionCard key={m.postId} mention={m} />)}</div>
          <Link className="ghost" href={`/posts?professor=${encodeURIComponent(id)}`}>{mentioned.length === 1 ? "Read the full post" : `All ${mentioned.length} posts`}<Arrow /></Link>
        </section></div>
      )}
    </>
  );
}
