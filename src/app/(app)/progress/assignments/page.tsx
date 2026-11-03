import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import Assignments from "@/screens/mobile/Assignments";
import { retry, type SearchParams } from "@/screens/mobile/mc/route";
import { assignments } from "@/server/views";

export const metadata: Metadata = { title: "Assignments" };

/** No desktop design for this list (desktop Progress shows deadlines inline), so both get this screen. */
export default async function AssignmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const [sp, user] = await Promise.all([searchParams, getUser()]);
  if (!user) redirect("/sign-in?next=/progress/assignments");
  const data = await assignments(user.id);
  if (!data) notFound();
  retry(user.id, sp);
  return <Assignments data={data} />;
}
