"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { Button, Switch, SwitchGroup } from "@/ui/components";
import { openShortcuts, toggleTheme } from "../global/bus";
import type { SettingsData } from "../model";
import { ButtonLink, css, cx, Hint } from "../parts";
import x from "../settings.module.css";

export type SettingsActions = {
  /** Server action: save one alert switch. */
  setAlert?: (id: string, on: boolean) => Promise<void>;
  /** Server action: refresh from the LMS now. */
  syncNow?: () => Promise<void>;
};

const THEMES = ["System", "Light", "Dark"] as const;

/** D13 Settings — account, appearance and actions on the left, Telegram alerts on the right. */
export function SettingsScreen({ data, actions }: { data: SettingsData; actions?: SettingsActions }) {
  const [, start] = useTransition();
  const [alerts, setAlerts] = useOptimistic(data.alerts, (state, change: { id: string; on: boolean }) => state.map((a) => (a.id === change.id ? { ...a, on: change.on } : a)));
  const [theme, setTheme] = useState<(typeof THEMES)[number]>("System");

  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      setTheme(t === "dark" ? "Dark" : t === "light" ? "Light" : "System");
    } catch {}
  }, []);

  const cycleTheme = () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    setTheme(next);
    const root = document.documentElement;
    try {
      if (next === "System") {
        localStorage.removeItem("theme");
        root.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } else {
        const want = next.toLowerCase();
        if ((root.dataset.theme ?? "light") !== want) toggleTheme();
      }
    } catch {}
  };

  return (
    <main className={cx(css.screen, x.main)}>
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
                <span>{data.lms.line}</span>
              </span>
              {actions?.syncNow && <Button label="Sync now" variant="secondary" size="s" onClick={() => start(() => actions.syncNow!())} />}
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
            <a className={x.row} href="/api/auth/signout">
              <span className={x.text}>
                <b>Sign out</b>
                <span>Press F forgets your LMS password; your ratings stay</span>
              </span>
            </a>
            <a className={cx(x.row, x.danger)} href="/me/delete">
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
            <SwitchGroup>
              {alerts.map((a) => (
                <Switch
                  key={a.id}
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
            </SwitchGroup>
          </div>
        </section>
      </div>
      <p className={x.credit}>{data.credit}</p>
    </main>
  );
}
