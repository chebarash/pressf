import type { Metadata } from "next";
import { getUser } from "@/lib/auth";
import DesktopSearch from "@/screens/desktop/Search";
import { mobile, one, type SearchParams } from "@/screens/mobile/mc/route";
import Search from "@/screens/mobile/Search";
import { search } from "@/server/views";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const [sp, user, isMobile] = await Promise.all([searchParams, getUser(), mobile()]);
  const data = await search(one(sp.q) ?? "", user ? { userId: user.id } : null);
  // "Curriculum of your program": the curriculum view picks the student's own cohort plan.
  return isMobile ? <Search data={data} programHref={user ? "/programs/mine/curriculum" : "/schools"} /> : <DesktopSearch data={data} />;
}
