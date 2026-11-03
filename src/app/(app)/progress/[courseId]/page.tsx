import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import DesktopCourseProgress from "@/screens/desktop/CourseProgress";
import CourseProgress from "@/screens/mobile/CourseProgress";
import { mobile, retry, type SearchParams } from "@/screens/mobile/mc/route";
import { courseProgress, progress } from "@/server/views";

export const metadata: Metadata = { title: "Progress" };

export default async function CourseProgressPage({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: SearchParams }) {
  const [{ courseId }, sp, user, isMobile] = await Promise.all([params, searchParams, getUser(), mobile()]);
  if (!user) redirect(`/sign-in?next=/progress/${courseId}`);
  const id = decodeURIComponent(courseId);
  await retry(user.id, sp);
  // The mobile sheet sits on Progress (Figma 5.2), so it reads both views in parallel.
  const [data, behind] = await Promise.all([courseProgress(user.id, id), isMobile ? progress(user.id) : Promise.resolve(null)]);
  if (!data) notFound();
  return isMobile ? <CourseProgress data={data} behind={behind} /> : <DesktopCourseProgress data={data} />;
}
