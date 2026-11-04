import type { SchedulePage } from "@/server/views";
import { TimetableScreen } from "./split/TimetableScreen";

/**
 * Timetable (D3 week, D8 month; Calendar was merged into it): one state and
 * two renderers, switched in place. The week scrolls sideways endlessly, the
 * month down; the inspector shows the clicked lesson or "Coming up".
 */
export default function DesktopTimetable({ data, open = null, demo = false }: { data: SchedulePage; /** ?class= : the lesson the inspector opens with. */ open?: string | null; demo?: boolean }) {
  return <TimetableScreen page={data} open={open} demo={demo} />;
}
