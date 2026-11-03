import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getUser } from "@/lib/auth";
import { getPlatform, isMobile } from "@/platform/server";
import { readNotification } from "@/server/sync/actions";
import * as views from "@/server/views";
import DesktopNotifications from "@/screens/desktop/Notifications";
import { markAllFeedRead, markFeedRead } from "@/screens/mobile/actions";
import MobileNotifications from "@/screens/mobile/Notifications";

export const metadata: Metadata = { title: "Notifications" };

type Props = { searchParams: Promise<{ filter?: string; open?: string }> };

export default async function NotificationsPage({ searchParams }: Props) {
  const [user, platform, params] = await Promise.all([getUser(), getPlatform(), searchParams]);
  if (!user) redirect("/sign-in?next=/notifications");
  const data = await views.notifications(user.id, { filter: params.filter, open: params.open });
  if (!data) redirect("/sign-in?next=/notifications");
  // Opened from a link (bot, Today): reading it is the act of opening it — read
  // here and in the LMS (and confirmed, if the LMS asked), after the response.
  const opened = data.open?.id;
  if (opened) after(() => readNotification(user.id, opened).catch(() => {}));
  return isMobile(platform) ? (
    <MobileNotifications data={data} />
  ) : (
    <DesktopNotifications data={data} actions={{ markRead: markFeedRead, markAllRead: markAllFeedRead }} />
  );
}
