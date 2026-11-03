import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import * as views from "@/server/views";
import DesktopToday from "@/screens/desktop/Today";
import MobileToday from "@/screens/mobile/Today";
import type { TodayData } from "@/screens/mobile/today/types";
import { GuestHero } from "@/ui/shell/GuestHero";

/** Guests get the public home (Figma 1.2): schools now; popular courses and fresh files once a public view serves them. */
async function guest(): Promise<TodayData> {
  const { schools } = await views.schools();
  return { guest: true, schools, popular: [], freshFiles: [] };
}

/** Today for students (2.x, 10.1); the guest home (1.2) for everyone else. */
export default async function TodayPage() {
  const [user, platform] = await Promise.all([getUser(), getPlatform()]);
  const data: TodayData = (user && (await views.today(user.id))) || (await guest());
  if (isMobile(platform)) return <MobileToday data={data} />;
  // Desktop Today takes the student view only; guests get the public hero.
  return "guest" in data ? <GuestHero /> : <DesktopToday data={data} />;
}
