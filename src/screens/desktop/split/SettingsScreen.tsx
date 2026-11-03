"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useSyncExternalStore, useTransition } from "react";
import { confirm } from "@/platform/client";
import { setTheme } from "@/platform/PlatformProvider";
import { RESET_CALENDAR_TEXT } from "@/screens/mobile/mc/format";
import { signOutWithConfirm } from "@/ui/shell/signOut";
import { Button, Switch } from "@/ui/components";
import { openShortcuts } from "../global/bus";
import type { SettingsData } from "../model";
import { ButtonLink, css, cx, Hint } from "../parts";
import x from "../settings.module.css";

export type SettingsActions = {
  /** Server action: save one alert switch. */
  setAlert?: (id: string, on: boolean) => Promise<void>;
  /** Server action: refresh from the LMS now; resolves with a line to show. */
  syncNow?: () => Promise<{ message: string } | void>;
  /** Server action: a new calendar feed link; the old one stops working. */
  resetCalendar?: () => Promise<{ ok: boolean }>;
};

const THEMES = ["System", "Light", "Dark"] as const;

/** The saved choice (the platform keeps it in pf_theme); re-read when the page theme flips. */
function readTheme(): (typeof THEMES)[number] {
  try {
    const t = localStorage.getItem("pf_theme");
    return t === "dark" ? "Dark" : t === "light" ? "Light" : "System";
  } catch {
    return "System";
  }
}
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** D13 Settings — account, appearance and actions on the left, Telegram alerts on the right. */
export function SettingsScreen({ data, actions }: { data: SettingsData; actions?: SettingsActions }) {
  const [, start] = useTransition();
  const [syncing, startSync] = useTransition();
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const runSync = () =>
    startSync(async () => {
      setSyncNote(null);
      const result = await actions!.syncNow!().catch(() => ({ message: "Sync failed. Try again in a minute" }));
      setSyncNote(result?.message ?? "Synced");
      router.refresh();
    });
  const [alerts, setAlerts] = useOptimistic(data.alerts, (state, change: { id: string; on: boolean }) => state.map((a) => (a.id === change.id ? { ...a, on: change.on } : a)));
  const router = useRouter();
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "System" as const);
  const cycleTheme = () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    setTheme(next === "System" ? null : next === "Dark" ? "dark" : "light");
  };
  const [resetting, startReset] = useTransition();
  const [resetNote, setResetNote] = useState<string | null>(null);
  const resetCalendar = async () => {
    const ok = await confirm(RESET_CALENDAR_TEXT, { title: "Reset calendar link?", ok: "Reset", cancel: "Cancel", destructive: true });
    if (!ok) return;
    startReset(async () => {
      const res = await actions!.resetCalendar!().catch(() => ({ ok: false }));
      setResetNote(res.ok ? "Done. Add the calendar again from Calendar" : "Could not reset. Try again");
    });
  };
  const signOut = async () => {
    if (await signOutWithConfirm()) router.push("/");
  };

  return (
    <main data-desktop-screen className={cx(css.screen, x.main)}>
      <h1 className={x.title}>Settings</h1>
      <div className={x.cols}>
        <div className={x.stack}>
          <section className={x.box}>
            <h2 className={x.boxTitle}>Account</h2>
            <div className={x.row}>
              <span className={x.text}>
                <b>{data.account.name}</b>
                <span>{data.account.line}</span>
              </span>
            </div>
            <div className={x.row}>
              <span className={x.text}>
                <b>LMS sync</b>
                <span aria-live="polite">{syncing ? "Syncing with the LMS…" : syncNote ?? data.lms.line}</span>
              </span>
              {actions?.syncNow && <Button label={syncing ? "Syncing…" : "Sync now"} variant="secondary" size="s" disabled={syncing} onClick={runSync} />}
            </div>
            <div className={x.row}>
              <span className={x.text}>
                <b>Telegram</b>
                <span>{data.telegram.line}</span>
              </span>
              {!data.telegram.linked && (
                <ButtonLink href={data.telegram.href} size="s">
                  Link Telegram
                </ButtonLink>
              )}
            </div>
          </section>

          <section className={x.box}>
            <h2 className={x.boxTitle}>Appearance</h2>
            <div className={x.row}>
              <span className={x.text}>
                <b>Theme</b>
                <span>Light, dark or follow the system</span>
              </span>
              <Button label={theme} variant="secondary" size="s" onClick={cycleTheme} />
            </div>
            <button type="button" className={x.row} onClick={openShortcuts}>
              <span className={x.text}>
                <b>Keyboard shortcuts</b>
                <span>Press ? anywhere</span>
              </span>
              <Hint>?</Hint>
            </button>
          </section>

          <section className={x.box}>
            <h2 className={x.boxTitle}>Account actions</h2>
            <button type="button" className={x.row} onClick={signOut}>
              <span className={x.text}>
                <b>Sign out</b>
                <span>Press F forgets your LMS password; your ratings stay</span>
              </span>
            </button>
            {actions?.resetCalendar && (
              <button type="button" className={x.row} onClick={resetCalendar} disabled={resetting}>
                <span className={x.text}>
                  <b>Reset calendar link</b>
                  <span aria-live="polite">{resetNote ?? "Your Google Calendar link stops working; add it again from Calendar"}</span>
                </span>
              </button>
            )}
            <a className={x.row} href="/me/delete">
              <span className={x.text}>
                <b>Delete my data</b>
                <span>Removes your account, saved password and ratings</span>
              </span>
            </a>
          </section>
        </div>

        <section className={x.box}>
          <h2 className={x.boxTitle}>Alerts in Telegram</h2>
          <div className={x.alerts}>
              {alerts.map((a) => (
                <Switch
                  key={a.id}
                  className={x.alertRow}
                  size="sm"
                  label={a.title}
                  description={a.note}
                  checked={a.on}
                  onChange={(e) => {
                    const on = e.currentTarget.checked;
                    start(async () => {
                      setAlerts({ id: a.id, on });
                      await actions?.setAlert?.(a.id, on);
                    });
                  }}
                />
              ))}
          </div>
        </section>
      </div>
      <p className={x.credit}>{data.credit}</p>
    </main>
  );
}
