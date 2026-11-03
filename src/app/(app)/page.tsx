import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import * as views from "@/server/views";
import { dismissRating } from "@/screens/mobile/actions";
import DesktopToday from "@/screens/desktop/Today";
import MobileToday from "@/screens/mobile/Today";
import type { TodayData } from "@/screens/mobile/today/types";
import { GuestHero } from "@/ui/shell/GuestHero";
import { retry, type SearchParams } from "@/screens/mobile/mc/route";

/** Guests get the public home (Figma 1.2): popular courses, fresh files and schools, in one cached read. */
const guest = (): Promise<TodayData> => views.guestHome();

/** Today for students (2.x, 10.1); the guest home (1.2) for everyone else. */
export default async function TodayPage({ searchParams }: { searchParams: SearchParams }) {
  const [user, platform, sp] = await Promise.all([getUser(), getPlatform(), searchParams]);
  // Desktop's "Retry" on the LMS-down banner links here with ?retry=1.
  await retry(user?.id, sp);
  const data: TodayData = (user && (await views.today(user.id))) || (await guest());
  if (isMobile(platform)) return <MobileToday data={data} />;
  // Desktop Today takes the student view only; guests get the public hero.
  return "guest" in data ? <GuestHero /> : <DesktopToday data={data} actions={{ dismissRating }} />;
}
