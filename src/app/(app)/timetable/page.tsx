import { redirect } from "next/navigation";
import { timetableHref } from "@/core/links";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import * as views from "@/server/views";
import Desktop from "@/screens/desktop/Timetable";
import { demo, demoOf } from "@/screens/mobile/load";
import { one } from "@/screens/mobile/mc/route";
import Mobile from "@/screens/mobile/Timetable";

export const metadata = { title: "Timetable" };
type Query = Promise<Record<string, string | string[] | undefined>>;

/**
 * Timetable, one section with two views of the same weeks (Calendar was merged
 * into it; /calendar redirects to ?view=month). ?day= is the day in view,
 * ?class= the lesson open in the panel; the page keeps both in the URL as it
 * scrolls. Old ?layers= links still open (ignored).
 */
export default async function Page({ searchParams }: { searchParams: Query }) {
  const [platform, user, q] = await Promise.all([getPlatform(), getUser(), searchParams]);
  const view: views.TimetableMode = one(q.view) === "month" ? "month" : "week";
  const day = one(q.day);
  const open = one(q.class) ?? null;
  const phone = isMobile(platform);
  const d = demoOf(q);

  // The month is the academic calendar for guests too; the week needs the student's classes.
  if (view === "week" && !user && !d) redirect(`/sign-in?next=${encodeURIComponent(timetableHref({ day }))}`);

  const data = d ? demo.timetable(d) : await views.schedule(user?.id ?? null, { view, day });
  if (!data) redirect("/sign-in?next=/timetable");
  const opened = open ?? (d === "sheet" || d === "running" ? data.weeks.flatMap((w) => w.days).flatMap((x) => x.classes).find((c) => c.day === data.day)?.key ?? null : null);
  return phone ? <Mobile data={data} open={opened} demo={!!d} /> : <Desktop data={data} open={opened} demo={!!d} />;
}
