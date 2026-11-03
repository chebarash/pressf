import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import Desktop from "@/screens/desktop/Rate";
import { loadRate } from "@/screens/mobile/load";
import Mobile from "@/screens/mobile/Rate";
import RateOverlay from "@/screens/mobile/RateOverlay";
import { submitRating } from "../../rate/actions";

/** "Rate now" (Today, Progress): the queue's first course over the current page; closing goes back there. */
export default async function RateQueueModal() {
  const [platform, user] = await Promise.all([getPlatform(), getUser()]);
  if (!user) redirect("/sign-in?next=/rate");
  const queue = await loadRate(user.id);
  if (!queue) redirect("/sign-in?next=/rate");
  if (!isMobile(platform)) return <Desktop data={queue} actions={{ submit: submitRating }} />;
  const first = queue.waiting[0];
  const data = first ? await loadRate(user.id, first.courseId) : null;
  // Nothing waiting: the list page itself says so.
  return data?.open ? <RateOverlay data={data} /> : <Mobile data={queue} />;
}
