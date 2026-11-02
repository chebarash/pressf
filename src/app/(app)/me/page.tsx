import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import DesktopSettings from "@/screens/desktop/Settings";
import { mobile } from "@/screens/mobile/mc/route";
import Settings from "@/screens/mobile/Settings";
import { profile } from "@/server/views";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const [user, isMobile] = await Promise.all([getUser(), mobile()]);
  if (!user) redirect("/sign-in?next=/me");
  const data = await profile(user.id);
  if (!data) notFound();
  return isMobile ? <Settings data={data} /> : <DesktopSettings data={data} />;
}
