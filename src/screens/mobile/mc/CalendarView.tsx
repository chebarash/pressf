"use client";

import { useEffect } from "react";
import type { FeedAlarms } from "@/core/calendar-text";
import type { SubscribeLinks } from "@/core/ics";
import { FeedLayers, type FeedLayer } from "./FeedLayers";
import { CALENDAR_NOTE } from "./format";
import { cx } from "./parts";
import { ResetCalendarRow } from "./ProfileControls";
import { FeedReminders, SubscribeButtons } from "./Subscribe";
import s from "./mc.module.css";
import c from "./screens.module.css";

/** Settings → Calendar opened from a link (/me#calendar, Timetable's hint): bring the section into view. */
export function useCalendarAnchor(id = "calendar") {
  useEffect(() => {
    if (location.hash !== `#${id}`) return;
    // After the page change has scrolled to the top.
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "auto" }), 60);
    return () => window.clearTimeout(t);
  }, [id]);
}

/**
 * Phone Settings → Calendar (8.1): subscribe in any calendar app, the feed's
 * layers and reminders, the reset. Timetable only links here.
 */
export function CalendarSection({ links, feed, alarms }: { links: SubscribeLinks | null; feed: FeedLayer[]; alarms: FeedAlarms }) {
  useCalendarAnchor();
  return (
    <section id="calendar" className={c.calendarSection} aria-labelledby="calendar-title">
      <h2 id="calendar-title" className={cx(s.section, "t-mobile-section")}>
        Calendar
      </h2>
      {links ? <SubscribeButtons links={links} /> : null}
      <FeedLayers layers={feed} />
      <FeedReminders alarms={alarms} />
      <div className={c.group}>
        <ResetCalendarRow />
      </div>
      <p className={c.calendarNote}>{CALENDAR_NOTE}</p>
    </section>
  );
}
