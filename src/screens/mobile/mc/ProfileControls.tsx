"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { addToHomeScreen, confirm, haptic, homeScreenStatus, setTheme } from "@/platform/client";
import { Switch } from "@/ui/components";
import { signOutWithConfirm } from "@/ui/shell/signOut";
import { deleteMyData, setAlert } from "./actions";
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
      <p className={cx(s.t15sb, s.grow)}>Theme</p>
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
      <p className={cx(s.t15sb, s.grow)}>Press F on home screen</p>
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
      <p className={cx(s.t15sb, s.accentText, s.grow)}>Sign out</p>
    </button>
  );
}

/** Delete my data (8.7): a destructive confirm, then the account goes and the session ends. */
export function DeleteRow() {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className={cx(c.setting, s.plainButton)}
      style={{ width: "100%" }}
      disabled={busy}
      onClick={async () => {
        const ok = await confirm("Your account, saved LMS password and ratings are removed for good. Anonymous posts stay anonymous.", {
          title: "Delete your data?",
          ok: "Delete",
          cancel: "Cancel",
          destructive: true,
        });
        if (!ok) return;
        start(async () => {
          const res = await deleteMyData();
          if (!res.ok) return haptic.notify("error");
          haptic.notify("success");
          await signOut({ redirect: false });
          router.replace("/");
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
        haptic.select();
        start(async () => {
          setValue(next);
          await setAlert(name, next);
        });
      }}
    />
  );
}
