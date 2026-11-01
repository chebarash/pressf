"use client";

import Link from "next/link";
import { useState } from "react";
import type { Lesson } from "@/lib/catalog";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const tone = (code: string | null) => `t${[...(code ?? "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 5}`;

export function Timetable({ lessons, today }: { lessons: Lesson[]; today: number }) {
  // Sunday, or a day without classes, opens on the next day that has some.
  const first = [0, 1, 2, 3, 4, 5, 6].map((step) => (today + step) % 7).find((d) => lessons.some((l) => l.day === d));
  const [day, setDay] = useState(first ?? 0);
  const [picked, setPicked] = useState<Lesson | null>(null);
  const days = DAYS.slice(0, Math.max(5, ...lessons.map((l) => l.day + 1)));
  const times = [...new Set(lessons.map((l) => l.starts))].sort();
  const detail = picked && (
    <div className="card" style={{ alignContent: "start" }}>
      <div className="row between"><h2 className="d-sm">{picked.subject}</h2><button className="ghost" onClick={() => setPicked(null)}>Close</button></div>
      <p className="small soft">{DAYS[picked.day]} {picked.starts}–{picked.ends}{picked.room ? `, ${picked.room}` : ""}</p>
      {picked.teacher && <Link className="label accent" href={`/professors/${picked.teacher}`}>{picked.teacher_name}</Link>}
      {picked.code && <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}><Link className="key btn primary sm" href={`/courses/${picked.code}`}>Open course</Link><Link className="key btn sm" href={`/courses/${picked.code}#files`}>Files</Link></div>}
    </div>
  );
  return (
    <div className="stack">
      <div className="hide-sm">
        <div className="tt" style={{ "--days": days.length } as React.CSSProperties}>
          <span />{days.map((d, i) => <span key={d} className={`label ${i === today ? "accent" : ""}`}>{d}</span>)}
          {times.map((time) => [
            <span key={time} className="small soft num">{time}</span>,
            ...days.map((_, d) => {
              const here = lessons.filter((l) => l.day === d && l.starts === time);
              return <div key={`${time}${d}`} className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>{here.map((l) => (
                <button key={`${l.subject}${l.room}`} className={`slot ${tone(l.code)} ${picked === l ? "on" : ""}`} onClick={() => setPicked(l)}><b style={{ fontWeight: 500 }}>{l.subject}</b><span className="soft">{l.room}</span></button>
              ))}</div>;
            }),
          ])}
        </div>
      </div>
      <div className="only-sm stack">
        <div className="tabs even">{days.map((d, i) => <button key={d} className={`tab ${day === i ? "on" : ""}`} onClick={() => setDay(i)}>{d}</button>)}</div>
        {lessons.filter((l) => l.day === day).sort((a, b) => a.starts.localeCompare(b.starts)).map((l) => (
          <button key={`${l.starts}${l.subject}`} className="class" onClick={() => setPicked(l)}><span className="label num">{l.starts}</span><span className="grow"><span className="label" style={{ display: "block" }}>{l.subject}</span><span className="small soft">{[l.teacher_name, l.room].filter(Boolean).join(" · ")}</span></span></button>
        ))}
        {!lessons.some((l) => l.day === day) && <p className="soft">No classes on this day.</p>}
      </div>
      {detail}
    </div>
  );
}
