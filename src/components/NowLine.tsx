"use client";

import { type RefObject, useEffect, useState } from "react";

const minutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };

function tashkentMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  return minutes(parts);
}

/** Finds the height of a time inside a grid whose rows are the class start times. */
function locate(grid: HTMLElement, column: number) {
  const rows = [...grid.querySelectorAll<HTMLElement>("[data-time]")];
  const cell = grid.querySelector<HTMLElement>(`[data-day-head="${column}"]`);
  if (rows.length === 0 || !cell) return null;
  const now = tashkentMinutes();
  const box = grid.getBoundingClientRect();
  const stops = rows.map((row) => ({ at: minutes(row.dataset.time!), top: row.getBoundingClientRect().top - box.top }));
  const last = stops[stops.length - 1];
  const end = minutes(rows[rows.length - 1].dataset.ends!);
  if (now < stops[0].at || now > end) return null;
  const after = stops.findIndex((stop) => stop.at > now);
  const from = stops[after === -1 ? stops.length - 1 : after - 1];
  const to = after === -1 ? { at: end, top: box.height } : stops[after];
  const top = from.top + (to.top - from.top) * ((now - from.at) / (to.at - from.at || 1));
  const head = cell.getBoundingClientRect();
  return { top: Math.min(top, box.height), left: head.left - box.left, width: head.width, last };
}

/** The line that marks the current time, on today's column only. */
export function NowLine({ grid, column }: { grid: RefObject<HTMLDivElement | null>; column: number }) {
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null);
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const update = () => { if (grid.current) setPlace(locate(grid.current, column)); };
    update();
    const clock = setInterval(update, 60_000);
    addEventListener("resize", update);
    const start = requestAnimationFrame(() => requestAnimationFrame(() => setArrived(true)));
    return () => { clearInterval(clock); removeEventListener("resize", update); cancelAnimationFrame(start); };
  }, [grid, column]);

  if (!place) return null;
  return <span className="now-line" aria-hidden="true" style={{ left: place.left, width: place.width, transform: `translateY(${arrived ? place.top : 0}px)` }} />;
}
