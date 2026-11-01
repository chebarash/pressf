"use client";

import Link from "next/link";
import { useState } from "react";
import type { Lesson } from "@/lib/catalog";
import { NowLine } from "./NowLine";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PER_HOUR = 64;
const GUTTER = 52;
const tone = (code: string | null) => `t${[...(code ?? "")].reduce((a, c) => a + c.charCodeAt(0), 0) % 5}`;

export function Timetable({ lessons, today }: { lessons: Lesson[]; today: number }) {
  // Sunday, or a day without classes, opens on the next day that has some.
  const first = [0, 1, 2, 3, 4, 5, 6].map((step) => (today + step) % 7).find((d) => lessons.some((l) => l.day === d));
  const [day, setDay] = useState(first ?? 0);
  const [picked, setPicked] = useState<Lesson | null>(null);
  const days = DAYS.slice(0, Math.max(5, ...lessons.map((l) => l.day + 1)));
  const minutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
  const from = Math.floor(Math.min(...lessons.map((l) => minutes(l.starts))) / 60);
  const to = Math.ceil(Math.max(...lessons.map((l) => minutes(l.ends))) / 60);
  const hours = Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const [view, setView] = useState<"week" | "today">("week");
  const dayList = (d: number) => lessons.filter((l) => l.day === d).sort((a, b) => a.starts.localeCompare(b.starts)).map((l) => (
    <button key={`${l.starts}${l.subject}`} className="class" onClick={() => setPicked(l)}><span className="label num">{l.starts}</span><span className="grow"><span className="label" style={{ display: "block" }}>{l.subject}</span><span className="small soft">{[l.teacher_name, l.room].filter(Boolean).join(" · ")}</span></span></button>
  ));
  const detail = picked && (
    <div key={`${picked.day}${picked.starts}${picked.subject}`} className="card pop-in" style={{ alignContent: "start" }}>
      <div className="row between"><h2 className="d-sm">{picked.subject}</h2><button className="ghost" onClick={() => setPicked(null)}>Close</button></div>
      <p className="small soft">{DAYS[picked.day]} {picked.starts}–{picked.ends}{picked.room ? `, ${picked.room}` : ""}</p>
      {picked.teacher && <Link className="label accent" href={`/professors/${picked.teacher}`}>{picked.teacher_name}</Link>}
      {picked.code && <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}><Link className="key btn primary sm" href={`/courses/${picked.code}`}>Open course</Link><Link className="key btn sm" href={`/courses/${picked.code}#files`}>Files</Link></div>}
    </div>
  );
  return (
    <div className="stack">
      <div className="hide-sm stack">
        <div className="tabs" style={{ justifyContent: "end", padding: 0 }}>
          <button className={`tab ${view === "week" ? "on" : ""}`} onClick={() => setView("week")}>Week</button>
          <button className={`tab ${view === "today" ? "on" : ""}`} onClick={() => setView("today")}>Today</button>
        </div>
        {view === "today" ? (
          lessons.some((l) => l.day === (first ?? 0)) ? <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>{dayList(first ?? 0)}</div> : <p className="soft">No classes on this day.</p>
        ) : (
          <div className="tt-week" style={{ "--days": days.length, "--hour": `${PER_HOUR}px`, "--gutter": `${GUTTER}px` } as React.CSSProperties}>
            <div className="tt-head"><span />{days.map((d, i) => <span key={d} className={`label ${i === today ? "accent" : ""}`}>{d}{i === today ? ", today" : ""}</span>)}</div>
            <div className="tt-body" style={{ height: (to - from) * PER_HOUR + 24 }}>
              {hours.map((hour) => <div key={hour} className="tt-hour" style={{ top: (hour - from) * PER_HOUR }}><span className="small soft num">{String(hour).padStart(2, "0")}:00</span></div>)}
              <div className="tt-days">
                {days.map((d, column) => (
                  <div key={d} className="tt-day">
                    {lessons.filter((l) => l.day === column).map((l, index, all) => {
                      const same = all.filter((other) => other.starts === l.starts);
                      const slot = same.indexOf(l);
                      return (
                        <button key={`${l.subject}${l.room}${index}`} className={`slot ${tone(l.code)} ${picked === l ? "on" : ""}`} onClick={() => setPicked(l)}
                          style={{ "--d": column, top: ((minutes(l.starts) - from * 60) / 60) * PER_HOUR, height: ((minutes(l.ends) - minutes(l.starts)) / 60) * PER_HOUR - 4, left: `${(slot * 100) / same.length}%`, width: `calc(${100 / same.length}% - 6px)` } as React.CSSProperties}>
                          <b style={{ fontWeight: 500 }}>{l.subject}</b><span className="soft">{l.starts}–{l.ends}{l.room ? ` · ${l.room}` : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              {today < days.length && <NowLine from={from} to={to} column={today} days={days.length} perHour={PER_HOUR} gutter={GUTTER} />}
            </div>
          </div>
        )}
      </div>
      <div className="only-sm stack">
        <div className="tabs even">{days.map((d, i) => <button key={d} className={`tab ${day === i ? "on" : ""}`} onClick={() => setDay(i)}>{d}</button>)}</div>
        {dayList(day)}
        {!lessons.some((l) => l.day === day) && <p className="soft">No classes on this day.</p>}
      </div>
      {detail}
    </div>
  );
}
