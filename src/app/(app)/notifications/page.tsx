import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import * as views from "@/server/views";
import DesktopNotifications from "@/screens/desktop/Notifications";
import { acknowledgeFeed, markAllFeedRead, markFeedRead } from "@/screens/mobile/actions";
import MobileNotifications from "@/screens/mobile/Notifications";

export const metadata: Metadata = { title: "Notifications" };

type Props = { searchParams: Promise<{ filter?: string; open?: string }> };

export default async function NotificationsPage({ searchParams }: Props) {
  const [user, platform, params] = await Promise.all([getUser(), getPlatform(), searchParams]);
  if (!user) redirect("/sign-in?next=/notifications");
  const data = await views.notifications(user.id, { filter: params.filter, open: params.open });
  if (!data) redirect("/sign-in?next=/notifications");
  return isMobile(platform) ? (
    <MobileNotifications data={data} />
  ) : (
    <DesktopNotifications data={data} actions={{ markRead: markFeedRead, acknowledge: acknowledgeFeed, markAllRead: markAllFeedRead }} />
  );
}
