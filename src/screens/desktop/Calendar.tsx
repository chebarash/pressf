import type { CalendarView } from "@/server/views";
import * as adapt from "./adapt";
import { CalendarScreen } from "./split/CalendarScreen";

/** D8 Calendar — the month with exams, deadlines, holidays and registration; "Coming up" beside it. ← → change month. */
export default function DesktopCalendar({ data }: { data: CalendarView }) {
  return <CalendarScreen data={adapt.calendar(data)} />;
}
