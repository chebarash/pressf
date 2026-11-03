import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import * as views from "@/server/views";
import Desktop from "@/screens/desktop/Timetable";
import { demo, demoOf } from "@/screens/mobile/load";
import Mobile from "@/screens/mobile/Timetable";

export const metadata = { title: "Timetable" };
type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: Query }) {
  const [platform, user, q] = await Promise.all([getPlatform(), getUser(), searchParams]);
  const day = typeof q.day === "string" ? q.day : undefined;
  const d = demoOf(q);
  if (!user && !d) redirect("/sign-in?next=/timetable");
  const view = d ? demo.timetable(d) : await views.timetable(user!.id, day);
  if (!view) redirect("/sign-in?next=/timetable");
  const data = { ...view, open: typeof q.class === "string" ? q.class : d === "sheet" || d === "running" ? "calc" : null };
  return isMobile(platform) ? <Mobile data={data} /> : <Desktop data={data} />;
}
