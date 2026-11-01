import { currentWeek, milestones } from "@/lib/calendar";

export const metadata = { title: "Calendar" };

const NAMES: Record<string, string> = { registration: "Course registration", induction: "Induction", midterm: "Midterm exams", final: "Final exams", break: "Break", resit_registration: "Resit registration", resit_exam: "Resit exams" };
const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default function CalendarPage() {
  const today = new Date().toISOString().slice(0, 10);
  const week = currentWeek();
  const next = milestones.find((m) => m.ends >= today);
  return (
    <div className="wrap section" style={{ maxWidth: 800 }}>
      <div><h1 className="d-title">Calendar</h1><p className="soft">2026–2027{week ? ` · ${week.label}` : ""}</p></div>
      <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
        {milestones.map((m) => {
          const done = m.ends < today;
          const on = m === next;
          return (
            <div key={m.order} className="line-row cal-row" style={{ background: on ? "var(--accent-soft)" : undefined, outline: on ? "2px solid var(--accent)" : undefined, outlineOffset: -2, color: done ? "var(--text-2)" : undefined }}>
              <span className="label num" style={{ width: 72, flex: "none" }}>{date(m.starts)}</span>
              <span className="grow"><span className="label" style={{ display: "block" }}>{NAMES[m.kind]}</span><span className="small soft">{m.term[0].toUpperCase() + m.term.slice(1)}{m.week ? `, Week ${m.week}` : ""}</span></span>
              {on && <span className="tag dark">Next up</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
