"use client";

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SchedulePage, ScheduleWeek, TimetableMode } from "@/server/views";
import { classByKey, localDayOf, mondayOf, switchView, type Weeks } from "./model";

/**
 * Timetable's one client state: the loaded weeks (never fetched twice), the
 * selected day and class, and the view. Both renderers read it; switching the
 * view swaps the renderer and keeps everything else. The URL follows
 * (?view=month&day=…&class=…) with replaceState, debounced, no navigation.
 */

export type ScheduleState = {
  view: TimetableMode;
  day: string;
  /** The selected class (its key), shown in the inspector or the phone's sheet. */
  open: string | null;
};

export type ScheduleStore = ScheduleState & {
  today: string;
  /** Loaded weeks by Monday; a new map whenever weeks arrive. */
  weeks: Weeks;
  page: SchedulePage;
  setView: (view: TimetableMode) => void;
  /** The day in view (scrolling, the day picker, ‹ Today ›). */
  setDay: (day: string) => void;
  select: (key: string | null) => void;
  /** Loads any of these Mondays not loaded or loading yet (batched, at most 8 per request). */
  ensure: (mondays: string[]) => void;
  /** No class loads into the demo previews. */
  demo: boolean;
};

const Ctx = createContext<ScheduleStore | null>(null);
const BATCH = 8;
const URL_DEBOUNCE = 250;

export function useSchedule(): ScheduleStore {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSchedule outside ScheduleProvider");
  return s;
}

/** The query Timetable's state reads back on reload: ?view=month&day=…&class=…. */
export function scheduleQuery(s: ScheduleState, today: string) {
  const q = new URLSearchParams();
  if (s.view === "month") q.set("view", "month");
  if (s.day !== today) q.set("day", s.day);
  if (s.open) q.set("class", s.open);
  const text = q.toString();
  return `/timetable${text ? `?${text}` : ""}`;
}

export function ScheduleProvider({ page, open = null, demo = false, children }: { page: SchedulePage; open?: string | null; demo?: boolean; children: ReactNode }) {
  const [weeks, setWeeks] = useState<ReadonlyMap<string, ScheduleWeek>>(() => new Map(page.weeks.map((w) => [w.monday, w])));
  // Mondays loaded or on their way: a week is fetched once.
  const known = useRef(new Set(page.weeks.map((w) => w.monday)));
  const [state, setState] = useState<ScheduleState>(() => ({ view: page.view, day: page.day, open: open && classByKey(new Map(page.weeks.map((w) => [w.monday, w])), open) ? open : null }));

  const ensure = useCallback(
    (mondays: string[]) => {
      if (demo) return;
      const missing = [...new Set(mondays)].filter((m) => !known.current.has(m)).sort();
      if (!missing.length) return;
      // Contiguous runs, one request each (at most BATCH weeks).
      const runs: string[][] = [];
      for (const m of missing) {
        const run = runs.at(-1);
        const prev = run?.at(-1);
        if (run && prev && run.length < BATCH && Date.parse(m) - Date.parse(prev) === 7 * 86_400_000) run.push(m);
        else runs.push([m]);
      }
      for (const run of runs) {
        for (const m of run) known.current.add(m);
        fetch(`/api/timetable?from=${run[0]}&weeks=${run.length}`, { credentials: "same-origin" })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((body: { weeks: ScheduleWeek[] }) =>
            startTransition(() =>
              setWeeks((before) => {
                const next = new Map(before);
                for (const w of body.weeks) next.set(w.monday, w);
                return next;
              }),
            ),
          )
          // A failed week may be asked for again when it scrolls back in.
          .catch(() => run.forEach((m) => known.current.delete(m)));
      }
    },
    [demo],
  );

  const setView = useCallback((view: TimetableMode) => startTransition(() => setState((s) => switchView(s, view))), []);
  const setDay = useCallback((day: string) => setState((s) => (s.day === day ? s : { ...s, day })), []);
  const select = useCallback((key: string | null) => setState((s) => (s.open === key ? s : { ...s, open: key, day: key ? (key.includes("@") ? localDayOf(key.split("@")[1]) : s.day) : s.day })), []);

  // The URL follows the state without navigating.
  useEffect(() => {
    if (demo) return;
    const t = window.setTimeout(() => {
      const next = scheduleQuery(state, page.today);
      if (`${location.pathname}${location.search}` !== next) window.history.replaceState(window.history.state, "", next);
    }, URL_DEBOUNCE);
    return () => window.clearTimeout(t);
  }, [state, page.today, demo]);

  // The week around the selected day is always wanted.
  useEffect(() => ensure([mondayOf(state.day)]), [state.day, ensure]);

  const value = useMemo<ScheduleStore>(
    () => ({ ...state, today: page.today, weeks, page, setView, setDay, select, ensure, demo }),
    [state, page, weeks, setView, setDay, select, ensure, demo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
