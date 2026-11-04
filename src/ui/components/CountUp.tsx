"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { appHydrated, reducedMotion } from "@/ui/motion";

const DURATION = 400;
/** Values that already counted up during this visit: coming back shows them at once. */
const counted = new Set<string>();

type Parts = { head: string; n: number; decimals: number; tail: string };

function split(value: string): Parts | null {
  const m = /^(\D*?)(\d+(?:\.\d+)?)(.*)$/s.exec(value);
  if (!m) return null;
  return { head: m[1], n: Number(m[2]), decimals: m[2].split(".")[1]?.length ?? 0, tail: m[3] };
}

const show = (p: Parts, n: number) => `${p.head}${n.toFixed(p.decimals)}${p.tail}`;

/**
 * A number that counts up from zero (≤ 400 ms) the first time it appears after a
 * navigation, then never again in this visit. The server render and the first
 * paint of a full load show the final value, so nothing flashes; reduced motion
 * shows it at once. The text is written straight to the node, so counting never
 * re-renders the screen.
 */
export function CountUp({ value, id = value }: { value: string; id?: string }) {
  const parts = split(value);
  const key = `${id}:${value}`;
  const [animate] = useState(() => appHydrated && !!parts && !counted.has(key) && !reducedMotion());
  const ref = useRef<HTMLSpanElement>(null);

  // Before paint: the markup always holds the final value (server and client
  // agree, so a late-hydrating boundary never mismatches); the count starts here.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!animate || !parts || !el) return;
    counted.add(key);
    el.textContent = show(parts, 0);
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / DURATION);
      el.textContent = show(parts, parts.n * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = value;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mounted value
  }, [animate, key]);

  return (
    <span ref={ref} key={key}>
      {value}
    </span>
  );
}
