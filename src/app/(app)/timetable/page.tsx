import { redirect } from "next/navigation";
import { timetableHref } from "@/core/links";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import * as views from "@/server/views";
import Desktop from "@/screens/desktop/Timetable";
import { demo, demoOf } from "@/screens/mobile/load";
import MobileMonth from "@/screens/mobile/Calendar";
import { one } from "@/screens/mobile/mc/route";
import Mobile from "@/screens/mobile/Timetable";

export const metadata = { title: "Timetable" };
type Query = Promise<Record<string, string | string[] | undefined>>;

/**
 * Timetable, one section for the week and the month (Calendar was merged into
 * it; /calendar redirects to ?view=month). ?day= picks the week's day or the
 * month to open. Everything shows; old ?layers= links still open (ignored).
 */
export default async function Page({ searchParams }: { searchParams: Query }) {
  const [platform, user, q] = await Promise.all([getPlatform(), getUser(), searchParams]);
  const view: views.TimetableMode = one(q.view) === "month" ? "month" : "week";
  const day = one(q.day);
  const phone = isMobile(platform);
  const d = demoOf(q);
  const switcher = { day: timetableHref({ day }), month: timetableHref({ view: "month", day }) };

  // The month is the academic calendar for guests too; the week needs the student's classes.
  if (view === "week" && !user && !d) redirect(`/sign-in?next=${encodeURIComponent(timetableHref({ day }))}`);

  if (view === "week" && phone) {
    const week = d ? demo.timetable(d) : await views.timetable(user!.id, day ?? undefined);
    if (!week) redirect("/sign-in?next=/timetable");
    const open = typeof q.class === "string" ? q.class : d === "sheet" || d === "running" ? "calc" : null;
    return <Mobile data={{ ...week, open }} views={switcher} />;
  }

  const data = await views.schedule(user?.id ?? null, { view, day, mobile: phone });
  if (!data) redirect("/sign-in?next=/timetable");
  if (phone) return <MobileMonth data={data.calendar} views={switcher} feed={data.feed?.layers ?? null} />;
  return <Desktop data={data} open={typeof q.class === "string" ? q.class : null} />;
}
