import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import Desktop from "@/screens/desktop/Rate";
import { loadRate } from "@/screens/mobile/load";
import RateOverlay from "@/screens/mobile/RateOverlay";
import { submitRating } from "../../../rate/actions";

/**
 * The rate dialog over the page it was opened from (soft navigation only; a
 * direct visit renders /rate/[courseId] as its own page). Closing goes back.
 */
export default async function RateModal({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [platform, user, { courseId }, q] = await Promise.all([getPlatform(), getUser(), params, searchParams]);
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/rate/${courseId}`)}`);
  const data = await loadRate(user.id, courseId, typeof q.from === "string" ? q.from : undefined);
  if (!data?.open) notFound();
  return isMobile(platform) ? <RateOverlay data={data} /> : <Desktop data={data} courseId={courseId} actions={{ submit: submitRating }} />;
}
