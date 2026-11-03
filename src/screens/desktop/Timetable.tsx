import type { ScheduleView } from "@/server/views";
import * as adapt from "./adapt";
import { CalendarScreen } from "./split/CalendarScreen";
import { TimetableScreen } from "./split/TimetableScreen";

/**
 * Timetable (D3 week, D8 month; Calendar was merged into it). Week: the class
 * grid with the calendar over it, the inspector or "Coming up" beside it.
 * Month: the calendar month with class dots. ← → change week or month.
 */
export default function DesktopTimetable({ data, open = null }: { data: ScheduleView; /** ?class= : the class the inspector opens with. */ open?: string | null }) {
  const s = adapt.schedule(data, new Date(), open);
  return s.view === "week" ? <TimetableScreen data={s.data} /> : <CalendarScreen data={{ ...s.data, nav: s.data.nav! }} />;
}
