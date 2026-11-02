"use client";

import { useEffect } from "react";
import { PlatformContext, type PlatformInfo } from "./hooks";
import { token } from "./telegram";
import { TelegramBridge } from "./TelegramBridge";

/** Follows the OS theme live unless the user picked one (or Telegram sets it). */
function ThemeFollower() {
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      if (document.documentElement.classList.contains("tg")) return;
      let stored: string | null = null;
      try { stored = localStorage.getItem("pf_theme"); } catch { /* storage blocked */ }
      if (!stored) document.documentElement.dataset.theme = media.matches ? "dark" : "light";
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);
  return null;
}

export function PlatformProvider({ value, children }: { value: PlatformInfo; children: React.ReactNode }) {
  return (
    <PlatformContext.Provider value={value}>
      {children}
      <TelegramBridge />
      <ThemeFollower />
    </PlatformContext.Provider>
  );
}

/** Sets the theme ("light" | "dark", or null to follow Telegram/the OS). */
export function setTheme(theme: "light" | "dark" | null) {
  try {
    if (theme) localStorage.setItem("pf_theme", theme);
    else localStorage.removeItem("pf_theme");
  } catch { /* storage blocked */ }
  const tg = window.Telegram?.WebApp;
  const inTg = document.documentElement.classList.contains("tg") && !!tg;
  document.documentElement.dataset.theme = theme ?? (inTg ? tg.colorScheme : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  if (inTg && tg.isVersionAtLeast("6.1")) {
    const page = token("--bg-page");
    tg.setHeaderColor(page);
    tg.setBackgroundColor(page);
    if (tg.isVersionAtLeast("7.10")) tg.setBottomBarColor?.(page);
  }
}
