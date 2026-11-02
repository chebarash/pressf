import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import * as views from "@/server/views";
import MobileQr from "@/screens/mobile/Qr";

export const metadata: Metadata = { title: "QR check-in" };

/** QR check-in is a Mini App flow: one screen everywhere; outside Telegram it says to open it there. */
export default async function QrPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/qr");
  return <MobileQr data={await views.today(user.id)} />;
}
