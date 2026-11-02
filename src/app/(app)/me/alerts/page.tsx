import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import DesktopSettings from "@/screens/desktop/Settings";
import Alerts from "@/screens/mobile/Alerts";
import { saveAlert, syncNow } from "@/screens/mobile/mc/actions";
import { mobile } from "@/screens/mobile/mc/route";
import { profile } from "@/server/views";

export const metadata: Metadata = { title: "Alerts" };

/** Desktop shows alerts inside Settings (D13). */
export default async function AlertsPage() {
  const [user, isMobile] = await Promise.all([getUser(), mobile()]);
  if (!user) redirect("/sign-in?next=/me/alerts");
  const data = await profile(user.id);
  if (!data) notFound();
  return isMobile ? <Alerts data={data} /> : <DesktopSettings data={data} actions={{ setAlert: saveAlert, syncNow }} />;
}
