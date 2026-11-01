"use client";

import { useEffect, useState } from "react";

const tashkentMinutes = () => {
  const [hours, minutes] = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":").map(Number);
  return hours * 60 + minutes;
};

/** The line that marks the current time, on today's column only. It slides in from the top. */
export function NowLine({ from, to, column, days, perHour, gutter }: { from: number; to: number; column: number; days: number; perHour: number; gutter: number }) {
  const [now, setNow] = useState<number | null>(null);
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const clock = setInterval(() => setNow(tashkentMinutes()), 60_000);
    const start = requestAnimationFrame(() => {
      setNow(tashkentMinutes());
      requestAnimationFrame(() => setArrived(true));
    });
    return () => { clearInterval(clock); cancelAnimationFrame(start); };
  }, []);

  if (now === null || now < from * 60 || now > to * 60) return null;
  const top = ((now - from * 60) / 60) * perHour;
  const width = `calc((100% - ${gutter}px) / ${days})`;
  return <span className="now-line" aria-hidden="true" style={{ left: `calc(${gutter}px + (100% - ${gutter}px) * ${column} / ${days})`, width, transform: `translateY(${arrived ? top : 0}px)` }} />;
}
