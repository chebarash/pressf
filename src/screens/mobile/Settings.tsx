import Link from "next/link";
import type { ProfileView } from "@/server/views";
import { Face } from "./mc/kit";
import { Chevron, cx, Screen } from "./mc/parts";
import { DeleteRow, HomeScreenRows, SignOutRow, ThemeRow } from "./mc/ProfileControls";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";

/** Mobile Profile (Figma 8.1; 8.2 sign out and 8.7 delete my data confirm natively). */
export default function Settings({ data }: { data: ProfileView }) {
  const alertsOn = Object.values(data.alerts).some(Boolean);
  return (
    <Screen className={s.noTopBar}>
      <div className={s.body}>
        <h1 className={cx(s.title, "t-mobile-title")}>Profile</h1>
        <div className={c.me}>
          <Face kind="mascot" size={64} />
          <div className={s.lines}>
            <p className={s.t16sb} style={{ fontSize: 17 }}>
              {data.shortName}
            </p>
            {data.year ? <p className={cx(s.t13, s.soft)}>Year {data.year}</p> : null}
            <p className={cx(s.t13, s.soft)}>{data.email}</p>
          </div>
        </div>

        <div className={c.group}>
          <Link href="/me/alerts" prefetch className={c.setting}>
            <p className={cx(s.t15sb, s.grow)}>Notifications in Telegram</p>
            <span className={c.settingValue}>{!data.telegramLinked ? "Not linked" : alertsOn ? "On" : "Off"}</span>
          </Link>
          <ThemeRow />
          <div className={c.setting}>
            <p className={cx(s.t15sb, s.grow)}>LMS sync</p>
            <span className={c.settingValue}>{data.sync.signInAgain ? "Sign in again" : data.sync.lmsDown ? "LMS not answering" : data.sync.label ?? "Not yet"}</span>
          </div>
          <HomeScreenRows />
        </div>

        <div className={c.group}>
          <Link href="/me/ratings" prefetch className={c.setting}>
            <p className={cx(s.t15sb, s.grow)}>My ratings</p>
            <span className={c.settingValue}>
              {data.ratings.count}
              {data.ratings.waiting ? ` · ${data.ratings.waiting} to rate` : ""}
            </span>
            <Chevron />
          </Link>
        </div>

        <div className={c.group}>
          <SignOutRow />
          <DeleteRow />
        </div>

        <div className={c.signature}>
          <p className={cx(s.section, "t-display-xs")}>Made with love by chebarash</p>
          <p className={cx(s.t14, s.soft)}>
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
