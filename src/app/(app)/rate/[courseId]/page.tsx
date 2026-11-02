import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import { rateMetadata } from "@/server/og";
import Desktop from "@/screens/desktop/Rate";
import { demo, demoOf, loadRate, rateScreen } from "@/screens/mobile/load";
import Mobile from "@/screens/mobile/Rate";

export const generateMetadata = () => rateMetadata();
type Query = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Query }) {
  const [platform, user, { courseId }, q] = await Promise.all([getPlatform(), getUser(), params, searchParams]);
  const d = demoOf(q);
  const from = typeof q.from === "string" ? q.from : undefined;
  if (!user && !d) redirect(`/sign-in?next=${encodeURIComponent(`/rate/${courseId}`)}`);
  const data = d ? rateScreen(demo.rate(), courseId, from) : await loadRate(user!.id, courseId, from);
  if (!data?.open) notFound();
  return isMobile(platform) ? <Mobile data={data} /> : <Desktop data={data} />;
}
