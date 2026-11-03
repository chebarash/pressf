import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import * as views from "@/server/views";
import Desktop from "@/screens/desktop/Courses";
import Mobile from "@/screens/mobile/Courses";
import { demo, demoOf } from "@/screens/mobile/load";
import { desktopCourseList } from "./list";

export const metadata = { title: "My courses" };
type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: Query }) {
  const [platform, user, q] = await Promise.all([getPlatform(), getUser(), searchParams]);
  const d = demoOf(q);
  if (!user && !d) redirect("/sign-in?next=/courses");
  const data = d ? demo.courses(d) : await views.myCourses(user!.id);
  if (!data) redirect("/sign-in?next=/courses");
  if (isMobile(platform)) return <Mobile data={data} />;
  if (d) return <Desktop data={data} />;
  // D4: the list pane picks a semester; the right side is its first course.
  const list = await desktopCourseList(user!.id, q, data);
  const first = list?.courses[0];
  const course = first ? await views.course(first.code, first.term ?? null, { userId: user!.id }) : null;
  return <Desktop data={data} list={list} course={course} />;
}
