import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { mobile } from "@/screens/mobile/mc/route";
import MyRatings from "@/screens/mobile/MyRatings";
import { rateQueue } from "@/server/views";

export const metadata: Metadata = { title: "My ratings" };

/** Same list on desktop until it has its own design (desktop Settings links here). */
export default async function MyRatingsPage() {
  const [user] = await Promise.all([getUser(), mobile()]);
  if (!user) redirect("/sign-in?next=/me/ratings");
  const data = await rateQueue(user.id);
  if (!data) notFound();
  return <MyRatings data={data} />;
}
