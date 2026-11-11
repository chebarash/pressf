"use client";

import { useOptimistic, useTransition } from "react";
import { Switch } from "@/ui/components";
import { setFeedLayer } from "./actions";
import c from "./screens.module.css";

export type FeedLayer = { id: string; label: string; on: boolean };

/**
 * "In your calendar": what the student's calendar feed carries, one
 * switch per layer (all on until changed). Beside "Add to Google Calendar" and
 * in Settings, phone and desktop. The site's Timetable always shows everything.
 * `bare`: just the switches, for a box that has its own title (desktop Settings).
 */
export function FeedLayers({ layers, size = "md", bare = false, className, rowClassName }: { layers: FeedLayer[]; size?: "md" | "sm"; bare?: boolean; className?: string; rowClassName?: string }) {
  const [shown, set] = useOptimistic(layers, (list: FeedLayer[], change: { id: string; on: boolean }) => list.map((l) => (l.id === change.id ? { ...l, on: change.on } : l)));
  const [, start] = useTransition();
  const rows = shown.map((l) => (
    <Switch
      key={l.id}
      label={l.label}
      size={size}
      className={rowClassName ?? c.feedRow}
      checked={l.on}
      onChange={(e) => {
        const on = e.target.checked;
        start(async () => {
          set({ id: l.id, on });
          await setFeedLayer(l.id, on);
        });
      }}
    />
  ));
  if (bare) return <div className={className}>{rows}</div>;
  return (
    <section className={[c.feedLayers, className].filter(Boolean).join(" ")} aria-label="In your calendar">
      <p className={c.feedTitle}>In your calendar</p>
      {rows}
    </section>
  );
}
