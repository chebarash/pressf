import Link from "next/link";
import type { ProfileView } from "@/server/views";
import { ChevronRightIcon, Face } from "./mc/kit";
import { cx, Screen } from "./mc/parts";
import { CalendarSection } from "./mc/CalendarView";
import { DeleteRow, HomeScreenRows, SignOutRow, ThemeRow } from "./mc/ProfileControls";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";

/** Mobile Profile (Figma 8.1; 8.2 sign out and 8.7 delete my data confirm natively). */
export default function Settings({ data }: { data: ProfileView }) {
  const alertsOn = Object.values(data.alerts).some(Boolean);
  return (
    <Screen>
      <div className={s.body} style={{ paddingBottom: 32 }}>
        <h1 className={cx(s.title, "t-mobile-title")}>Profile</h1>
        <div className={c.me}>
          <Face kind="mascot" size={64} />
          <div className={s.lines}>
            <p className={c.meName}>{data.shortName}</p>
            {data.year ? <p className={cx(s.t13, s.soft)}>Year {data.year}</p> : null}
            <p className={cx(s.t13, s.soft)}>{data.email}</p>
          </div>
        </div>

        <div className={cx(c.group, c.groupSpaced)}>
          <Link href="/me/alerts" prefetch className={c.setting}>
            <p className={c.settingLabel}>Notifications in Telegram</p>
            <span className={c.settingValue}>{!data.telegramLinked ? "Not linked" : alertsOn ? "On" : "Off"}</span>
          </Link>
          <ThemeRow />
          <div className={c.setting}>
            <p className={c.settingLabel}>LMS sync</p>
            <span className={c.settingValue}>{data.sync.signInAgain ? "Sign in again" : data.sync.lmsDown ? "LMS not answering" : data.sync.label ?? "Not yet"}</span>
          </div>
          <HomeScreenRows />
        </div>

        {/* Everything about the Google Calendar feed; Timetable on the site always shows everything and only links here. */}
        <CalendarSection google={data.calendar?.google ?? null} feed={data.feed} />

        <div className={c.group}>
          <Link href="/me/ratings" prefetch className={c.setting}>
            <p className={c.settingLabel}>My ratings</p>
            <span className={c.settingValue}>
              {data.ratings.count}
              {data.ratings.waiting ? ` · ${data.ratings.waiting} to rate` : ""}
            </span>
            <ChevronRightIcon size={16} className={s.chev} aria-hidden />
          </Link>
        </div>

        <div className={c.group}>
          <SignOutRow />
          <DeleteRow />
        </div>

        <div className={c.signature}>
          <p className={cx(s.section, "t-display-xs")}>Made with love by chebarash</p>
          <p className={cx(s.t14, s.soft)} style={{ lineHeight: 1.4 }}>
            Issues or ideas?{" "}
            <a href="https://t.me/chebarash" target="_blank" rel="noreferrer">
              Reach out on Telegram.
            </a>
          </p>
        </div>
      </div>
    </Screen>
  );
}
