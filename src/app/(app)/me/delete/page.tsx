import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import DesktopSettings from "@/screens/desktop/Settings";
import { saveAlert, syncNow } from "@/screens/mobile/mc/actions";
import { DeleteConfirm } from "@/screens/mobile/mc/ProfileControls";
import { mobile } from "@/screens/mobile/mc/route";
import Settings from "@/screens/mobile/Settings";
import { profile } from "@/server/views";

export const metadata: Metadata = { title: "Delete my data" };

/**
 * Delete my data (Figma 8.7): the profile with the destructive confirm open —
 * Telegram's native popup in the Mini App, the shell's dialog on the web and desktop.
 */
export default async function DeletePage() {
  const [user, isMobile] = await Promise.all([getUser(), mobile()]);
  if (!user) redirect("/sign-in?next=/me/delete");
  const data = await profile(user.id);
  if (!data) notFound();
  return (
    <>
      {isMobile ? <Settings data={data} /> : <DesktopSettings data={data} actions={{ setAlert: saveAlert, syncNow }} />}
      <DeleteConfirm />
    </>
  );
}
