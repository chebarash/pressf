"use client";

import { useEffect, useState } from "react";

const tashkentMinutes = () => {
  const d = new Date(Date.now() + 5 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

/** Minutes since midnight in Tashkent, ticking each minute (null on the server and before hydration). */
export function useNowMinutes() {
  const [m, setM] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setM(tashkentMinutes());
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [setM]);
  return m;
}

/** "10:42". */
export const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
