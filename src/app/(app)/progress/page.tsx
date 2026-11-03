import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import DesktopProgress from "@/screens/desktop/Progress";
import { mobile, retry, type SearchParams } from "@/screens/mobile/mc/route";
import Progress from "@/screens/mobile/Progress";
import { progress } from "@/server/views";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage({ searchParams }: { searchParams: SearchParams }) {
  const [sp, user, isMobile] = await Promise.all([searchParams, getUser(), mobile()]);
  if (!user) redirect("/sign-in?next=/progress");
  await retry(user.id, sp);
  const data = await progress(user.id);
  if (!data) notFound();
  return isMobile ? <Progress data={data} /> : <DesktopProgress data={data} />;
}
