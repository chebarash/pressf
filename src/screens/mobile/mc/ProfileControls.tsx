"use client";

import { signOut } from "next-auth/react";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { Switch } from "@/ui/components";
import { deleteMyData, setAlert } from "./actions";
import { confirmAction } from "./client";
import { cx } from "./parts";
import s from "./mc.module.css";
import c from "./screens.module.css";

type Theme = "system" | "light" | "dark";
const THEME_LABEL: Record<Theme, string> = { system: "Like Telegram", light: "Light", dark: "Dark" };

function applyTheme(t: Theme) {
  const root = document.documentElement;
  try {
    if (t === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", t);
  } catch {
    /* storage blocked */
  }
  if (t === "system") {
    const tg = (globalThis as { Telegram?: { WebApp?: { colorScheme?: string } } }).Telegram?.WebApp?.colorScheme;
    const dark = tg ? tg === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "dark" : "light";
  } else root.dataset.theme = t;
}

/** Theme row: Like Telegram → Light → Dark. */
export function ThemeRow() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the per-device choice after hydration
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* storage blocked */
    }
  }, []);
  const next = () => {
    const t: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(t);
    applyTheme(t);
  };
  return (
    <button type="button" className={cx(c.setting, s.plainButton)} onClick={next} style={{ width: "100%" }}>
      <p className={cx(s.t15sb, s.grow)}>Theme</p>
      <span className={c.settingValue}>{THEME_LABEL[theme]}</span>
    </button>
  );
}

type TelegramApp = { addToHomeScreen?: () => void; checkHomeScreenStatus?: (cb: (status: string) => void) => void; isVersionAtLeast?: (v: string) => boolean };
const tgApp = () => (globalThis as { Telegram?: { WebApp?: TelegramApp } }).Telegram?.WebApp;

/** "Press F on home screen" (Telegram 8.0+ only; hidden elsewhere). */
export function HomeScreenRows() {
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    const app = tgApp();
    if (!app?.addToHomeScreen || !app.isVersionAtLeast?.("8.0")) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Telegram only exists on the client
    setStatus("unknown");
    app.checkHomeScreenStatus?.((st) => setStatus(st));
  }, []);
  if (!status || status === "unsupported") return null;
  return (
    <button type="button" className={cx(c.setting, s.plainButton)} style={{ width: "100%" }} onClick={() => tgApp()?.addToHomeScreen?.()} disabled={status === "added"}>
      <p className={cx(s.t15sb, s.grow)}>Press F on home screen</p>
      <span className={c.settingValue}>{status === "added" ? "Added" : "Add"}</span>
    </button>
  );
}

/** Sign out (8.2): confirm first, then end the session. */
export function SignOutRow() {
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className={cx(c.setting, s.plainButton)}
      style={{ width: "100%" }}
      disabled={busy}
      onClick={async () => {
        const ok = await confirmAction("You can sign in again any time with your NewUU account.", { title: "Sign out?", ok: "Sign out", destructive: true });
        if (ok) start(() => signOut({ callbackUrl: "/" }));
      }}
    >
      <p className={cx(s.t15sb, s.accentText, s.grow)}>Sign out</p>
    </button>
  );
}

/** Delete my data (8.7): a destructive popup, then the account goes and the session ends. */
export function DeleteRow() {
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className={cx(c.setting, s.plainButton)}
      style={{ width: "100%" }}
      disabled={busy}
      onClick={async () => {
        const ok = await confirmAction("Your account, saved LMS password and ratings are removed for good. Anonymous posts stay anonymous.", {
          title: "Delete your data?",
          ok: "Delete",
          destructive: true,
        });
        if (!ok) return;
        start(async () => {
          const res = await deleteMyData();
          if (res.ok) await signOut({ callbackUrl: "/" });
        });
      }}
    >
      <p className={cx(s.t15sb, c.danger, s.grow)}>{busy ? "Deleting…" : "Delete my data"}</p>
    </button>
  );
}

/** One alert switch (8.5), optimistic. */
export function AlertSwitch({ name, label, hint, on }: { name: string; label: string; hint: string; on: boolean }) {
  const [value, setValue] = useOptimistic(on);
  const [, start] = useTransition();
  return (
    <Switch
      label={label}
      description={hint}
      checked={value}
        onChange={(e) => {
          const next = e.target.checked;
          start(async () => {
            setValue(next);
            await setAlert(name, next);
          });
        }}
    />
  );
}
