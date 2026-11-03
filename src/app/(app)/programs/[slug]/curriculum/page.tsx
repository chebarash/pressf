import type { Metadata } from "next";
import { getUser } from "@/lib/auth";
import DesktopCurriculum from "@/screens/desktop/Curriculum";
import Curriculum from "@/screens/mobile/Curriculum";
import { mobile, one, type SearchParams } from "@/screens/mobile/mc/route";
import { curriculum } from "@/server/views";

type Params = Promise<{ slug: string }>;

export const metadata: Metadata = { title: "Curriculum" };

/** `slug` is the LMS program id; "mine" picks the signed-in student's own cohort plan. */
export default async function CurriculumPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ slug }, sp, user, isMobile] = await Promise.all([params, searchParams, getUser(), mobile()]);
  const data = await curriculum(user ? { userId: user.id } : null, slug === "mine" ? null : slug);
  const base = `/programs/${slug}/curriculum`;
  return isMobile ? <Curriculum data={data} base={base} year={Number(one(sp.year)) || null} course={one(sp.course)} /> : <DesktopCurriculum data={data} />;
}
