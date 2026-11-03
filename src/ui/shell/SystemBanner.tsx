import { Banner } from "@/ui/components/Banner";
import { getUser } from "@/lib/auth";
import { shellBanner } from "@/server/broadcasts";

/**
 * The frame's banner over every screen: the maintenance notice (A10, mustard)
 * or a broadcast's in-app banner until its end date (9.4 StatusBannerMobile).
 * Reads cached settings only, so it never slows the frame down.
 */
export async function SystemBanner() {
  const user = await getUser();
  const banner = await shellBanner(user?.id ?? null).catch(() => null);
  if (!banner) return null;
  return (
    <div className="sh-banner" data-banner={banner.id}>
      <Banner tone={banner.tone} action={banner.action ?? undefined}>
        {banner.text}
      </Banner>
    </div>
  );
}
