"use client";

import { useState } from "react";

type Week = { week: string; topic: string };

export function WeekList({ weeks, current }: { weeks: Week[]; current: number | null }) {
  const index = weeks.findIndex((week) => Number(week.week) === current);
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const start = index > 0 ? index - 1 : 0;
  const shown = all ? weeks : weeks.slice(start, start + 4);
  return (
    <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
      {shown.map((week) => {
        const n = Number(week.week);
        const now = current !== null && n === current;
        const past = current !== null && n < current;
        return (
          <button key={week.week} className={`week ${now ? "current" : ""} ${past ? "past" : ""} ${open === week.week ? "open" : ""}`} onClick={() => setOpen(open === week.week ? null : week.week)}>
            <span className="label soft num">{week.week}</span>
            <span className="topic">{week.topic}</span>
            {now && <span className="tag dark">This week</span>}
          </button>
        );
      })}
      {weeks.length > 4 && <button className="ghost" onClick={() => setAll(!all)}>{all ? "Show less" : `All ${weeks.length} weeks`}</button>}
    </div>
  );
}
