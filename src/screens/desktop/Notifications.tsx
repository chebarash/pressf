import type { NotificationsView } from "@/server/views";
import * as adapt from "./adapt";
import { NotificationsScreen, type NotificationActions } from "./split/NotificationsScreen";

/**
 * D7 Notifications (D18 when all read). `actions` are optional server actions for
 * "Got it" / read all; without them reading is optimistic on this page only.
 */
export default function DesktopNotifications({ data, actions }: { data: NotificationsView; actions?: NotificationActions }) {
  return <NotificationsScreen data={adapt.notifications(data)} actions={actions} />;
}
