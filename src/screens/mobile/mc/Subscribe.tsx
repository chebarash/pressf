"use client";

import { useEffect, useState, useTransition } from "react";
import { CLASS_ALARM_CHOICES, type FeedAlarms } from "@/core/calendar-text";
import type { SubscribeApp, SubscribeLinks } from "@/core/ics";
import { openLink, webApp } from "@/platform/client";
import { Button, Chip, Disclosure, Switch, Toast, ToastViewport } from "@/ui/components";
import { useDismissHint } from "@/ui/shell/Hints";
import { setFeedAlarms } from "./actions";
import c from "./subscribe.module.css";

/**
 * "Subscribe in your calendar" (Settings → Calendar, phone and desktop, and
 * the guests' academic calendar): one button for the viewer's own calendar
 * app (Apple on iPhone and Mac, Google elsewhere), the others under "Other
 * calendars", and "Copy link" for any app that subscribes to an iCal link.
 * In the Mini App every link leaves through Telegram's openLink; Apple's
 * webcal:// link does not open from Telegram's browser, so there it opens our
 * https page that hands webcal:// to Safari and the Calendar app.
 */

const LABEL: Record<SubscribeApp, string> = { google: "Google Calendar", apple: "Apple Calendar", outlook: "Outlook.com", office: "Outlook (work or school)" };
/** How often each app re-reads a subscribed calendar. */
export const APP_NOTE: Record<SubscribeApp, string> = {
  google: "Google refreshes it on its own schedule, up to about a day.",
  apple: "iPhone and Mac. Updates about every hour.",
  outlook: "Personal Microsoft accounts. Updates every few hours.",
  office: "Microsoft 365 at work or school. Updates every few hours.",
};
const OTHER_NOTE = "Any app that subscribes to an iCal/ICS link.";

/** The apps in the order everyone sees them: Google first (the main button), on every device. */
export const APP_ORDER: SubscribeApp[] = ["google", "apple", "outlook", "office"];

/** Where a button goes: in Telegram an https page for Apple (opened in Safari), else each app's own link. */
export function appLink(links: SubscribeLinks, app: SubscribeApp, inTelegram: boolean) {
  if (app === "apple") return inTelegram ? links.appleHttps : links.apple;
  return links[app];
}

function useToast() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(null), 4000);
    return () => clearTimeout(t);
  }, [text]);
  return [text, setText] as const;
}

export function SubscribeButtons({ links, variant = "phone", personal = true }: { links: SubscribeLinks; variant?: "phone" | "desktop"; personal?: boolean }) {
  const dismiss = useDismissHint();
  const [toast, setToast] = useToast();

  const open = (app: SubscribeApp) => {
    const inTelegram = !!webApp();
    const url = appLink(links, app, inTelegram);
    if (inTelegram) openLink(url, { tryInstantView: false });
    else if (app === "apple") window.location.href = url;
    else window.open(url, "_blank", "noopener");
    // Timetable's "Get your timetable in your calendar" never shows again.
    if (personal) dismiss("timetable-google");
    setToast(app === "apple" && inTelegram ? "Opens in Safari, then the Calendar app asks to subscribe." : `Confirm in ${LABEL[app]}. ${APP_NOTE[app]}`);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(links.feed);
      setToast("Copied");
    } catch {
      setToast(links.feed);
    }
    if (personal) dismiss("timetable-google");
  };

  const [first, ...rest] = APP_ORDER;
  return (
    <div className={[c.box, variant === "desktop" && c.desktop].filter(Boolean).join(" ")}>
      <p className={c.title}>Subscribe in your calendar</p>
      <div className={c.primary}>
        <Button label={`Add to ${LABEL[first]}`} size="s" variant={variant === "desktop" ? "secondary" : "primary"} icon={false} onClick={() => open(first)} data-app={first} />
        <p className={c.note}>{APP_NOTE[first]}</p>
      </div>
      <Disclosure summary={<span>Other calendars</span>} className={c.others} headClassName={c.othersHead}>
        {rest.map((app) => (
          <div key={app} className={c.app}>
            <span className={c.appText}>
              <b>{LABEL[app]}</b>
              <span className={c.note}>{APP_NOTE[app]}</span>
            </span>
            <Button label="Add" size="s" variant="secondary" icon={false} onClick={() => open(app)} data-app={app} aria-label={`Add to ${LABEL[app]}`} />
          </div>
        ))}
        <div className={c.app}>
          <span className={c.appText}>
            <b>Other apps</b>
            <span className={c.note}>{OTHER_NOTE}</span>
          </span>
          <Button label="Copy link" size="s" variant="secondary" icon={false} onClick={copy} />
        </div>
      </Disclosure>
      {toast ? (
        <ToastViewport className={c.viewport}>
          <Toast className={c.toast}>{toast}</Toast>
        </ToastViewport>
      ) : null}
    </div>
  );
}

/** Google Calendar's own settings page; the calendar's notifications are set there, per calendar. */
export const GOOGLE_SETTINGS = "https://calendar.google.com/calendar/r/settings";

const MINUTES_LABEL: Record<FeedAlarms["classes"], string> = { 0: "Off", 15: "15 min", 30: "30 min", 60: "1 h" };

/**
 * "Reminders in your calendar": the VALARM of each event. Apple Calendar and
 * Outlook use them; Google ignores reminders in calendars added by URL and uses
 * the calendar's own default notifications, so its line says where to set them.
 */
export function FeedReminders({ alarms, variant = "phone" }: { alarms: FeedAlarms; variant?: "phone" | "desktop" }) {
  const [shown, setShown] = useState(alarms);
  const [, start] = useTransition();
  const save = (change: Partial<FeedAlarms>) => {
    setShown((s) => ({ ...s, ...change }));
    start(async () => {
      const next = await setFeedAlarms(change);
      if (next) setShown(next);
    });
  };
  return (
    <section className={[c.box, variant === "desktop" && c.desktop].filter(Boolean).join(" ")} aria-label="Reminders in your calendar">
      <p className={c.title}>Reminders in your calendar</p>
      <p className={c.note}>Before classes</p>
      <div className={c.choices} role="group" aria-label="Before classes">
        {CLASS_ALARM_CHOICES.map((m) => (
          <Chip key={m} label={MINUTES_LABEL[m]} size="s" selected={shown.classes === m} onClick={() => save({ classes: m })} />
        ))}
      </div>
      <Switch label="Exams and syllabus quizzes" description="A day and an hour before" size="sm" checked={shown.exams} onChange={(e) => save({ exams: e.target.checked })} />
      <p className={c.google}>
        Google Calendar ignores these in subscribed calendars: set them in{" "}
        <a href={GOOGLE_SETTINGS} target="_blank" rel="noopener noreferrer" onClick={(e) => { if (webApp()) { e.preventDefault(); openLink(GOOGLE_SETTINGS, { tryInstantView: false }); } }}>
          Google Calendar → Settings
        </a>{" "}
        → the Press F calendar → Event notifications.
      </p>
    </section>
  );
}
