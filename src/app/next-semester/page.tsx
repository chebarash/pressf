import Link from "next/link";
import { redirect } from "next/navigation";
import { CourseCard } from "@/components/Cards";
import { Banner, Stat } from "@/components/ui";
import { getCatalog } from "@/lib/catalog";
import { currentGroup } from "@/lib/group";
import { courseRatings } from "@/lib/ratings";

export const metadata = { title: "Next semester" };

export default async function NextSemester() {
  const group = await currentGroup();
  if (!group) redirect("/me/group");
  const [catalog, ratings] = await Promise.all([getCatalog(), courseRatings()]);
  const info = catalog.groups.find((g) => g.class === group);
  const next = catalog.semesters.next;
  const curriculum = info?.program ? catalog.curricula[info.program] : undefined;
  const term = next?.id.startsWith("spring") ? "spring" : "fall";
  const semester = curriculum?.semesters.find((s) => s.year === (term === "fall" ? (info!.year ?? 0) + 1 : info!.year) && s.term === term);
  if (!semester) {
    return <div className="wrap section"><h1 className="d-title">Next up</h1><Banner href="/me/group" action="Change group">We do not have a curriculum for {group}, so next semester courses are not shown.</Banner></div>;
  }
  const core = semester.courses.filter((c) => c.type !== "elective");
  const electives = semester.courses.filter((c) => c.type === "elective");
  const ects = core.reduce((a, c) => a + (c.credits ?? 0), 0);
  const card = (c: (typeof core)[number]) => <CourseCard key={c.code} code={c.code} name={c.subject} score={ratings.get(c.code)?.overall} meta={c.credits ? `${c.credits} ECTS` : ""} />;
  return (
    <div className="wrap section">
      <div><h1 className="d-title">Next up: {next?.name}</h1><p className="soft">{group}. From your curriculum, so you can look around before registration.</p></div>
      <div className="row" style={{ "--gap": "48px" } as React.CSSProperties}><Stat value={ects} label="ECTS required" /><Stat value={Math.round((ects * 30) / 15)} label="hours a week" /></div>
      <Banner href="/calendar" action="See calendar">Spring registration runs Feb 15–19. Teachers below are from this term&apos;s timetable.</Banner>
      <h2 className="d-md">Required</h2><div className="grid-3">{core.map(card)}</div>
      {electives.length > 0 && <><h2 className="d-md">Electives</h2><div className="grid-3">{electives.map(card)}</div></>}
      <Link className="ghost" href="/me">Back to my semester</Link>
    </div>
  );
}
