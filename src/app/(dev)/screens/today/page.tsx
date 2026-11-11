import Link from "next/link";
import { notFound } from "next/navigation";
import { GUEST, notificationsFixture, qrFixture, TODAY_STATES } from "@/screens/mobile/fixtures";
import MobileNotifications from "@/screens/mobile/Notifications";
import DesktopNotifications from "@/screens/desktop/Notifications";
import DesktopToday from "@/screens/desktop/Today";
import DesktopGuestHome from "@/screens/desktop/GuestHome";
import MobileQr from "@/screens/mobile/Qr";
import type { QrResult } from "@/screens/mobile/parts/QrFlow";
import MobileToday from "@/screens/mobile/Today";
import { Shell } from "@/ui/shell/Shell";
import { BottomBar } from "@/ui/shell/BottomBar";
import Loading from "@/app/(app)/loading";
import { FirstSync } from "@/ui/shell/FirstSync";
import { HomeScreenPreview } from "./HomeScreenPreview";

/**
 * Dev-only preview of every Figma state of Today, Notifications and QR on
 * fixtures: /screens/today?state=2.3-over (add &theme=dark; &desktop=1 for D1 and the desktop guest home).
 */

const QR: Record<string, QrResult | "shortcut" | undefined> = {
  "10.2-scanner": undefined,
  "10.3-marked": { kind: "marked", subject: "Physics 1 · Lecture 15 · A-108", time: "10:04", absencesLeft: 11 },
  "10.4-expired": { kind: "expired" },
  "10.5-not-your-class": { kind: "not-your-class", subject: "Discrete Mathematics, cohort 874" },
  "10.6-shortcut": "shortcut",
  "10.8-camera-off": { kind: "camera-off" },
  "10.9-offline": { kind: "offline" },
};

type Props = { searchParams: Promise<{ state?: string; theme?: string; desktop?: string }> };

export default async function Preview({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state, theme, desktop } = await searchParams;
  const themeScript = theme ? <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(theme === "dark" ? "dark" : "light")}` }} /> : null;

  const framed = (screen: React.ReactNode) => (
    <>
      {themeScript}
      <Shell>{screen}</Shell>
    </>
  );
  // Desktop Today (D1) on the same fixtures: add &desktop=1 in a desktop browser.
  if (desktop && state && state in TODAY_STATES) return framed(<DesktopToday data={TODAY_STATES[state as keyof typeof TODAY_STATES]()} />);
  if (desktop && state === "1.2-guest") return framed(<DesktopGuestHome data={GUEST} />);
  if (state && state in TODAY_STATES) return framed(<MobileToday data={TODAY_STATES[state as keyof typeof TODAY_STATES]()} />);
  if (state === "1.1-loading") return framed(<Loading />);
  if (state === "1.9-home-screen") return framed(<><MobileToday data={TODAY_STATES["2.1-morning"]()} /><HomeScreenPreview /></>);
  if (state === "1.7-first-sync" || state === "1.8-alerts")
    return (
      <>
        {themeScript}
        <div className="sh-auth-mobile">
          <FirstSync next="/" preview={{ states: { profile: "done", courses: "done", timetable: "done", grades: state === "1.8-alerts" ? "done" : "running", files: state === "1.8-alerts" ? "done" : "waiting" }, askAlerts: state === "1.8-alerts" }} />
          <BottomBar />
        </div>
      </>
    );
  if (state === "1.2-guest") return framed(<MobileToday data={GUEST} />);
  if (state === "2.9-notifications") return framed(<MobileNotifications data={notificationsFixture()} />);
  if (state === "2.10-notification-open") return framed(<MobileNotifications data={notificationsFixture("lms:1")} />);
  if (state === "2.10-files-open") return framed(<MobileNotifications data={notificationsFixture("files:dl:f1,f2,f3,f4,f5")} />);
  if (state === "D7-files-open") return <>{themeScript}<Shell><DesktopNotifications data={notificationsFixture("files:dl:f1,f2,f3,f4,f5")} /></Shell></>;
  if (state && state in QR) return framed(<MobileQr data={qrFixture()} preview={QR[state]} />);

  const all = [...Object.keys(TODAY_STATES), "1.1-loading", "1.2-guest", "1.7-first-sync", "1.8-alerts", "1.9-home-screen", "2.9-notifications", "2.10-notification-open", "2.10-files-open", "D7-files-open", ...Object.keys(QR)];
  return (
    <ul style={{ padding: 24, display: "grid", gap: 8 }}>
      {all.map((s) => (
        <li key={s}>
          <Link href={`?state=${s}`}>{s}</Link> · <Link href={`?state=${s}&theme=dark`}>dark</Link>
        </li>
      ))}
    </ul>
  );
}
