import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import { nextMetadata } from "@/server/og";
import * as views from "@/server/views";
import Desktop from "@/screens/desktop/Next";
import { demo, demoOf } from "@/screens/mobile/load";
import Mobile from "@/screens/mobile/Next";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  return nextMetadata((await params).code);
}
type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Query }) {
  const [platform, user, { code }, q] = await Promise.all([getPlatform(), getUser(), params, searchParams]);
  const d = demoOf(q);
  if (!user && !d) redirect(`/sign-in?next=${encodeURIComponent(`/next/${code}`)}`);
  const view = d ? demo.next() : await views.nextSemester(user!.id);
  if (!view) redirect(`/sign-in?next=${encodeURIComponent(`/next/${code}`)}`);
  const open = code.toUpperCase();
  if (!view.courses.some((c) => c.code === open)) notFound();
  const data = { ...view, open };
  return isMobile(platform) ? <Mobile data={data} /> : <Desktop data={data} />;
}
