import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import * as views from "@/server/views";
import Desktop from "@/screens/desktop/Next";
import { demo, demoOf } from "@/screens/mobile/load";
import Mobile from "@/screens/mobile/Next";

export const metadata = { title: "Next semester" };
type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: Query }) {
  const [platform, user, q] = await Promise.all([getPlatform(), getUser(), searchParams]);
  const d = demoOf(q);
  if (!user && !d) redirect("/sign-in?next=/next");
  const view = d ? demo.next() : await views.nextSemester(user!.id);
  if (!view) redirect("/sign-in?next=/next");
  const data = { ...view, open: null };
  return isMobile(platform) ? <Mobile data={data} /> : <Desktop data={data} />;
}
