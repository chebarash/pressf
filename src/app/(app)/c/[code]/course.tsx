import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import * as views from "@/server/views";
import Desktop from "@/screens/desktop/Course";
import Mobile from "@/screens/mobile/Course";
import { demo, demoOf } from "@/screens/mobile/load";
import type { CourseTab } from "@/screens/mobile/views";

type Query = Record<string, string | string[] | undefined>;

/**
 * Shared by /c/[code], /c/[code]/files and /c/[code]/anonymous. The view drops
 * files, weeks and the syllabus for guests, so the files tab falls back to the overview.
 */
export async function renderCourse(tab: CourseTab, params: Promise<{ code: string }>, searchParams: Promise<Query>) {
  const [platform, user, { code }, q] = await Promise.all([getPlatform(), getUser(), params, searchParams]);
  const d = demoOf(q);
  const term = typeof q.term === "string" ? q.term : null;
  const view = d ? demo.course(code.toUpperCase(), d) : await views.course(code, term, user ? { userId: user.id } : null);
  if (!view) notFound();
  const data = { ...view, tab: tab === "files" && !view.files ? ("overview" as const) : tab, notice: q.sent ? ("rating-sent" as const) : null };
  return isMobile(platform) ? <Mobile data={data} /> : <Desktop data={data} />;
}
