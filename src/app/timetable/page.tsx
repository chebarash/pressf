import Link from "next/link";
import { Timetable } from "@/components/Timetable";
import { Banner, Empty } from "@/components/ui";
import { after } from "next/server";
import { getUser } from "@/lib/auth";
import { currentWeek } from "@/lib/calendar";
import { getCatalog } from "@/lib/catalog";
import { currentGroup } from "@/lib/group";
import { preloadUser, userData } from "@/lib/lms/cache";

export const metadata = { title: "Timetable" };
type Props = { searchParams: Promise<{ class?: string }> };

export default async function TimetablePage({ searchParams }: Props) {
  const { class: requested } = await searchParams;
  const week = currentWeek();
  const today = (new Date().getDay() + 6) % 7;
  const weekLabel = week ? ` · ${week.kind === "midterm" ? "Week 8, midterm exams" : week.label}` : "";

  // A signed-in student sees their own live LMS schedule; no group to pick.
  const user = requested ? null : await getUser();
  if (user) {
    const { data, stale } = await userData(user.id, user.email);
    if (stale) after(() => preloadUser(user.id, user.email).catch(() => {}));
    const lessons = data.timetable;
    if (lessons.length) {
      return (
        <div className="wrap section">
          <h1 className="d-title">Timetable</h1>
          <p className="soft">Your schedule{weekLabel} · from the LMS</p>
          <Timetable lessons={lessons} today={today} />
        </div>
      );
    }
  }

  const [catalog, mine] = await Promise.all([getCatalog(), currentGroup()]);
  const group = requested ?? mine;
  if (!group) return <div className="wrap section"><h1 className="d-title">Timetable</h1><Empty title="Pick your group first" action={<Link className="key btn" href="/me/group">Choose group</Link>}>Choose your group once and your whole week shows up here.</Empty></div>;
  const lessons = catalog.timetable.filter((l) => l.class === group);
  return (
    <div className="wrap section">
      <div className="row between"><div><h1 className="d-title">Timetable</h1><p className="soft">{group}{weekLabel} · Updated daily</p></div><Link className="key btn sm" href="/me/group">View another group</Link></div>
      {requested && mine && requested !== mine && <Banner href="/timetable" action={`Back to ${mine}`}>You are viewing {requested}. Your group is {mine}.</Banner>}
      {lessons.length ? <Timetable lessons={lessons} today={today} /> : <p className="soft">No classes found for {group}.</p>}
    </div>
  );
}
