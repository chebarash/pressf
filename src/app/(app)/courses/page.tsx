import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import * as views from "@/server/views";
import Desktop from "@/screens/desktop/Courses";
import Mobile from "@/screens/mobile/Courses";
import { demo, demoOf } from "@/screens/mobile/load";

export const metadata = { title: "My courses" };
type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: Query }) {
  const [platform, user, q] = await Promise.all([getPlatform(), getUser(), searchParams]);
  const d = demoOf(q);
  if (!user && !d) redirect("/sign-in?next=/courses");
  const data = d ? demo.courses(d) : await views.myCourses(user!.id);
  if (!data) redirect("/sign-in?next=/courses");
  return isMobile(platform) ? <Mobile data={data} /> : <Desktop data={data} />;
}
