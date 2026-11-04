"use client";

import { useEffect, useState } from "react";
import { openLink } from "@/platform/client";
import { useDismissHint } from "@/ui/shell/Hints";
import { FeedLayers, type FeedLayer } from "./FeedLayers";
import { CALENDAR_NOTE } from "./format";
import { cx } from "./parts";
import { ResetCalendarRow } from "./ProfileControls";
import { Toast, ToastViewport } from "./kit";
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

/** "Add to Google Calendar": Google's add-by-URL page (Telegram's openLink in the Mini App); counts as setting it up. */
export function useAddToGoogle(google: string) {
  const dismiss = useDismissHint();
  const [toast, setToast] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const add = () => {
    openLink(google);
    // Timetable's "Get your timetable in Google Calendar" never shows again.
    dismiss("timetable-google");
    setToast(true);
  };
  return { add, toast };
}

/**
 * Phone Settings → Calendar (8.1): the Google Calendar feed, its layers, the
 * reset, and how often Google refreshes it. Timetable only links here.
 */
export function CalendarSection({ google, feed }: { google: string | null; feed: FeedLayer[] }) {
  useCalendarAnchor();
  const { add, toast } = useAddToGoogle(google ?? "");
  return (
    <section id="calendar" className={c.calendarSection} aria-labelledby="calendar-title">
      <h2 id="calendar-title" className={cx(s.section, "t-mobile-section")}>
        Calendar
      </h2>
      <div className={c.group}>
        {google ? (
          <button type="button" className={cx(c.setting, s.plainButton)} style={{ width: "100%" }} onClick={add}>
            <p className={c.settingLabel}>Google Calendar</p>
            <span className={cx(c.settingValue, c.settingAction)}>Add</span>
          </button>
        ) : null}
        <ResetCalendarRow />
      </div>
      <FeedLayers layers={feed} />
      <p className={c.calendarNote}>{CALENDAR_NOTE}</p>
      {toast ? (
        <ToastViewport className={c.subViewport}>
          <Toast className={c.subToast}>Confirm in Google Calendar. It stays in sync on Google&apos;s schedule, up to about a day.</Toast>
        </ToastViewport>
      ) : null}
    </section>
  );
}
