import type { ReactNode } from "react";
import { Tabs } from "@/ui/components";
import s from "./Timetable.module.css";

export type TimetableViewLinks = { day: string; month: string };

/** "Timetable" with the Day | Month switch (Figma Tab) beside it, on both of the phone's views. */
export function TimetableTitle({ title, views, active }: { title: ReactNode; views: TimetableViewLinks; active: "day" | "month" }) {
  return (
    <div className={s.titleRow}>
      {title}
      <Tabs
        label="View"
        items={[
          { label: "Day", value: "day", href: views.day, active: active === "day" },
          { label: "Month", value: "month", href: views.month, active: active === "month" },
        ]}
      />
    </div>
  );
}
