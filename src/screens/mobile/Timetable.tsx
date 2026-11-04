import { ScheduleProvider } from "@/screens/shared/schedule/store";
import type { SchedulePage } from "@/server/views";
import b from "./parts/base.module.css";
import { PhoneTimetable } from "./parts/TimetableDays";

/**
 * Mobile Timetable (Figma 3.1–3.7 Day, 6.1 Month): one state, two renderers
 * switched in place. Day swipes endlessly between days; Month is an endless
 * list of the same days (classes included). A class opens the sheet of that
 * dated lesson in both.
 */
export default function Timetable({ data, open = null, demo = false }: { data: SchedulePage; open?: string | null; demo?: boolean }) {
  return (
    <ScheduleProvider page={data} open={open} demo={demo}>
      <div className={b.screen}>
        <PhoneTimetable title={<h1 className={b.title}>Timetable</h1>} />
      </div>
    </ScheduleProvider>
  );
}
