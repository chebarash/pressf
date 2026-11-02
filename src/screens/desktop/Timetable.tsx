import type { TimetableView } from "@/server/views";
import * as adapt from "./adapt";
import { TimetableScreen } from "./split/TimetableScreen";

/** D3 Timetable — the week as a grid; the inspector shows the class you click. ← → change week, T today. */
export default function DesktopTimetable({ data }: { data: TimetableView }) {
  return <TimetableScreen data={adapt.timetable(data)} />;
}
