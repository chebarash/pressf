import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import { GuestHero } from "@/ui/shell/GuestHero";
import { GuestSignIn } from "@/ui/shell/GuestSignIn";
import { Placeholder } from "@/ui/shell/Placeholder";

/** Today for students; the guest home (1.2) for everyone else. Screen agents fill both. */
export default async function Home() {
  const [user, platform] = await Promise.all([getUser(), getPlatform()]);
  if (user) return <Placeholder title="Today" />;
  return (
    <>
      <GuestHero />
      {isMobile(platform) && <GuestSignIn />}
    </>
  );
}
