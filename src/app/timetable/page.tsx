import Link from "next/link";
import { Timetable } from "@/components/Timetable";
import { Banner, Empty } from "@/components/ui";
import { currentWeek } from "@/lib/calendar";
import { getCatalog } from "@/lib/catalog";
import { currentGroup } from "@/lib/group";

export const metadata = { title: "Timetable" };
type Props = { searchParams: Promise<{ class?: string }> };

export default async function TimetablePage({ searchParams }: Props) {
  const { class: requested } = await searchParams;
  const [catalog, mine] = await Promise.all([getCatalog(), currentGroup()]);
  const group = requested ?? mine;
  const week = currentWeek();
  if (!group) return <div className="wrap section"><h1 className="d-title">Timetable</h1><Empty title="Pick your group first" action={<Link className="key btn" href="/me/group">Choose group</Link>}>Choose your group once and your whole week shows up here.</Empty></div>;
  const lessons = catalog.timetable.filter((l) => l.class === group);
  const today = (new Date().getDay() + 6) % 7;
  return (
    <div className="wrap section">
      <div className="row between"><div><h1 className="d-title">Timetable</h1><p className="soft">{group}{week ? ` · ${week.kind === "midterm" ? "Week 8, midterm exams" : week.label}` : ""} · Updated daily</p></div><Link className="key btn sm" href="/me/group">View another group</Link></div>
      {requested && mine && requested !== mine && <Banner href="/timetable" action={`Back to ${mine}`}>You are viewing {requested}. Your group is {mine}.</Banner>}
      {lessons.length ? <Timetable lessons={lessons} today={today} /> : <p className="soft">No classes found for {group}.</p>}
    </div>
  );
}
