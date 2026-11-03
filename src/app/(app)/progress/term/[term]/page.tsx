import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import DesktopProgressTerm from "@/screens/desktop/ProgressTerm";
import { mobile, retry, type SearchParams } from "@/screens/mobile/mc/route";
import ProgressTerm from "@/screens/mobile/ProgressTerm";
import { termResults } from "@/server/views";

export const metadata: Metadata = { title: "Progress" };

/** An earlier semester's results (5.1 "Earlier semesters" → 5.6 layout; desktop in the D6 style). */
export default async function ProgressTermPage({ params, searchParams }: { params: Promise<{ term: string }>; searchParams: SearchParams }) {
  const [{ term }, sp, user, isMobile] = await Promise.all([params, searchParams, getUser(), mobile()]);
  if (!user) redirect(`/sign-in?next=/progress/term/${term}`);
  await retry(user.id, sp);
  const data = await termResults(user.id, term);
  if (!data) notFound();
  return isMobile ? <ProgressTerm data={data} /> : <DesktopProgressTerm data={data} />;
}
