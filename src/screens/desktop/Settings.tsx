import type { ProfileView } from "@/server/views";
import * as adapt from "./adapt";
import { SettingsScreen, type SettingsActions } from "./split/SettingsScreen";

/** D13 Settings. `actions` are optional server actions (alert switches, sync now). */
export default function DesktopSettings({ data, actions }: { data: ProfileView; actions?: SettingsActions }) {
  return <SettingsScreen data={adapt.profile(data)} actions={actions} />;
}
