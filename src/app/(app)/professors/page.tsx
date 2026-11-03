import type { Metadata } from "next";
import { getUser } from "@/lib/auth";
import DesktopProfessors from "@/screens/desktop/Professors";
import { mobile, one, type SearchParams } from "@/screens/mobile/mc/route";
import Professors from "@/screens/mobile/Professors";
import { professors } from "@/server/views";

export const metadata: Metadata = { title: "Professors" };

export default async function ProfessorsPage({ searchParams }: { searchParams: SearchParams }) {
  const [sp, user, isMobile] = await Promise.all([searchParams, getUser(), mobile()]);
  const data = await professors(user ? { userId: user.id } : null);
  return isMobile ? <Professors data={data} school={one(sp.school)} /> : <DesktopProfessors data={data} />;
}
