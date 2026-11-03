"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { addToHomeScreen, confirm, haptic, homeScreenStatus, setTheme } from "@/platform/client";
import { Switch } from "@/ui/components";
import { signOutWithConfirm } from "@/ui/shell/signOut";
import { deleteMyData, resetCalendarLink, setAlert } from "./actions";
import { RESET_CALENDAR_TEXT } from "./format";
import { cx } from "./parts";
import s from "./mc.module.css";
import c from "./screens.module.css";

type Theme = "system" | "light" | "dark";
const THEME_LABEL: Record<Theme, string> = { system: "Like Telegram", light: "Light", dark: "Dark" };

/** Theme row: Like Telegram → Light → Dark (the platform's setTheme). */
export function ThemeRow() {
  const [theme, set] = useState<Theme>("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pf_theme");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the per-device choice after hydration
      if (saved === "light" || saved === "dark") set(saved);
    } catch {
      /* storage blocked */
    }
  }, []);
  const next = () => {
    const t: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    set(t);
    haptic.select();
    setTheme(t === "system" ? null : t);
  };
  return (
    <button type="button" className={cx(c.setting, s.plainButton)} onClick={next} style={{ width: "100%" }}>
      <p className={c.settingLabel}>Theme</p>
      <span className={c.settingValue}>{THEME_LABEL[theme]}</span>
    </button>
  );
}

/** "Press F on home screen" (Telegram 8.0+; hidden where unsupported). */
export function HomeScreenRows() {
  const [status, setStatus] = useState<string>("unsupported");
  useEffect(() => {
    void homeScreenStatus().then(setStatus);
  }, []);
  if (status === "unsupported") return null;
  return (
    <button
      type="button"
      className={cx(c.setting, s.plainButton)}
      style={{ width: "100%" }}
      onClick={() => {
        if (addToHomeScreen()) void homeScreenStatus().then(setStatus);
      }}
      disabled={status === "added"}
    >
      <p className={c.settingLabel}>Press F on home screen</p>
      <span className={c.settingValue}>{status === "added" ? "Added" : "Add"}</span>
    </button>
  );
}

/** Sign out (8.2): the shell's confirm-and-forget flow, then home. */
export function SignOutRow() {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className={cx(c.setting, s.plainButton)}
      style={{ width: "100%" }}
      disabled={busy}
      onClick={() =>
        start(async () => {
          if (await signOutWithConfirm()) router.replace("/");
        })
      }
    >
      <p className={cx(c.settingLabel, s.accentText)}>Sign out</p>
    </button>
  );
}

/** 8.7: Telegram's destructive popup (the shell's dialog on the web), then delete and sign out. */
function useDeleteMyData() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const run = async () => {
    const ok = await confirm("Your account, saved LMS password and ratings are removed for good. Anonymous posts stay anonymous.", {
      title: "Delete your data?",
      ok: "Delete",
      cancel: "Cancel",
      destructive: true,
    });
    if (!ok) return false;
    start(async () => {
      const res = await deleteMyData();
      if (!res.ok) return haptic.notify("error");
      haptic.notify("success");
      await signOut({ redirect: false });
      router.replace("/");
    });
    return true;
  };
  return { busy, run };
}

/** /me/delete: asks right away; cancelling goes back to the profile. */
export function DeleteConfirm() {
  const router = useRouter();
  const { run } = useDeleteMyData();
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void run().then((ok) => {
      if (!ok) router.replace("/me");
    });
  });
  return null;
}

/** Delete my data row on the profile (8.7). */
export function DeleteRow() {
  const { busy, run } = useDeleteMyData();
  return (
    <button type="button" className={cx(c.setting, s.plainButton)} style={{ width: "100%" }} disabled={busy} onClick={() => void run()}>
      {/* No Figma trigger: styled exactly like the other profile rows. */}
      <p className={c.settingLabel}>{busy ? "Deleting…" : "Delete my data"}</p>
    </button>
  );
}

/** "Reset calendar link": the old Google Calendar feed stops working (confirmed natively first). */
export function ResetCalendarRow() {
  const [busy, start] = useTransition();
  const [done, setDone] = useState(false);
  const run = async () => {
    const ok = await confirm(RESET_CALENDAR_TEXT, { title: "Reset calendar link?", ok: "Reset", cancel: "Cancel", destructive: true });
    if (!ok) return;
    start(async () => {
      const res = await resetCalendarLink().catch(() => ({ ok: false }));
      haptic.notify(res.ok ? "success" : "error");
      setDone(res.ok);
    });
  };
  return (
    <button type="button" className={cx(c.setting, s.plainButton)} style={{ width: "100%" }} disabled={busy} onClick={() => void run()}>
      <p className={c.settingLabel}>Calendar link</p>
      <span className={c.settingValue}>{busy ? "Resetting…" : done ? "Reset" : "Reset link"}</span>
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
        // The switch tick comes from the Telegram bridge (every role="switch").
        const next = e.target.checked;
        start(async () => {
          setValue(next);
          await setAlert(name, next);
        });
      }}
    />
  );
}
