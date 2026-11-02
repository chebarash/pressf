import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import DesktopSettings from "@/screens/desktop/Settings";
import Alerts from "@/screens/mobile/Alerts";
import { mobile } from "@/screens/mobile/mc/route";
import { profile } from "@/server/views";

export const metadata: Metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const [user, isMobile] = await Promise.all([getUser(), mobile()]);
  if (!user) redirect("/sign-in?next=/me/alerts");
  const data = await profile(user.id);
  if (!data) notFound();
  return isMobile ? <Alerts data={data} /> : <DesktopSettings data={data} />;
}
