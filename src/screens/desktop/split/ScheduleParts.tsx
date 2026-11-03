import { FeedLayers } from "@/screens/mobile/mc/FeedLayers";
import { subscribeHint } from "@/screens/mobile/mc/format";
import { Tabs } from "@/ui/components";
import k from "../calendar.module.css";
import type { CalendarKind, ScheduleNav } from "../model";
import { AnchorButton, css, cx } from "../parts";

/**
 * What Timetable's Week and Month share (Calendar was merged into Timetable):
 * the Week | Month switch, and "Coming up" with "Add to Google Calendar" and the
 * feed's own settings ("In Google Calendar"). The site always shows everything.
 */

export const BAR: Record<CalendarKind, string> = { week: "var(--school-humanities)", class: "var(--bg-accent)", deadline: "var(--rating-mid)", exam: "var(--bg-danger)", registration: "var(--school-humanities)", holiday: "var(--school-medicine)" };

/** Week | Month (Figma Tab); `week` overrides the Week link (the month view points it at the month on screen). */
export function ViewSwitch({ nav, week }: { nav: ScheduleNav; week?: string }) {
  return <Tabs label="View" items={nav.views.map((v) => ({ label: v.label, value: v.label, href: v.label === "Week" && week ? week : v.href, active: v.active }))} />;
}

/** "Coming up": exams, deadlines, holidays and registration from today, then the Google Calendar feed and its settings. */
export function ComingUp({ nav, className }: { nav: Pick<ScheduleNav, "coming" | "empty" | "subscribe" | "feed">; className?: string }) {
  return (
    <section className={cx(css.card, k.coming, className)} aria-label="Coming up">
      <h2 className={k.comingTitle}>Coming up</h2>
      {nav.empty && <p className={k.itemMeta}>{nav.empty}</p>}
      {nav.coming.map((c) => (
        <div key={c.key} className={k.item}>
          <span className={k.bar} style={{ background: BAR[c.kind] }} />
          <span>
            <p className={k.itemTitle}>{c.title}</p>
            <p className={k.itemMeta}>{c.meta}</p>
          </span>
        </div>
      ))}
      {/* Google's add-by-URL page for the student's own feed; in Telegram the bridge opens it with openLink. */}
      <AnchorButton href={nav.subscribe.google} target="_blank" rel="noopener noreferrer" variant="secondary">
        Add to Google Calendar
      </AnchorButton>
      <p className={k.itemMeta}>{subscribeHint(nav.subscribe.personal)}</p>
      {nav.feed && <FeedLayers layers={nav.feed} size="sm" />}
    </section>
  );
}
