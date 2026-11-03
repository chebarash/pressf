import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { LinkTelegramPage } from "./LinkTelegramPage";

export const metadata = { title: "Continue in Telegram", robots: { index: false } };

/** D19 as a page, for links from Settings and Profile ("Telegram · Not linked"). */
export default async function LinkPage() {
  if (!(await getUser())) redirect("/sign-in?next=/link");
  return <LinkTelegramPage />;
}
