"use client";

import { signIn } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { startPath } from "@/lib/telegram/start";
import { FileViewer } from "./FileViewer";

type Insets = { top: number; bottom: number };
type NativeButton = { setText(text: string): void; show(): void; hide(): void; onClick(handler: () => void): void; offClick(handler: () => void): void; showProgress(leaveActive: boolean): void; hideProgress(): void };
export type WebApp = {
  initData: string; colorScheme: "light" | "dark"; platform?: string; isFullscreen?: boolean; safeAreaInset?: Insets; contentSafeAreaInset?: Insets;
  initDataUnsafe?: { start_param?: string };
  requestFullscreen?(): void; requestWriteAccess?(callback: (allowed: boolean) => void): void; downloadFile?(params: { url: string; file_name: string }): void;
  switchInlineQuery?(query: string, chats: string[]): void; showAlert?(message: string): void;
  addToHomeScreen?(): void; checkHomeScreenStatus?(callback: (status: string) => void): void;
  MainButton?: NativeButton; SettingsButton?: { show(): void; onClick(handler: () => void): void };
  ready(): void; expand(): void; disableVerticalSwipes?(): void; isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void; setBackgroundColor(color: string): void; setBottomBarColor?(color: string): void;
  onEvent(name: string, handler: () => void): void; openLink(url: string, options?: { try_instant_view: boolean }): void; openTelegramLink(url: string): void;
  BackButton: { show(): void; hide(): void; onClick(handler: () => void): void };
  HapticFeedback?: { impactOccurred(style: "light"): void; notificationOccurred(type: "success" | "error" | "warning"): void; selectionChanged(): void };
};

declare global { interface Window { Telegram?: { WebApp: WebApp } } }

export const webApp = () => (document.documentElement.classList.contains("tg") ? window.Telegram?.WebApp : undefined);

function launched() {
  try {
    if (location.hash.includes("tgWebAppData")) sessionStorage.setItem("tg", "1");
    return sessionStorage.getItem("tg") === "1";
  } catch {
    return location.hash.includes("tgWebAppData");
  }
}

const loadSdk = () => new Promise<void>((resolve, reject) => {
  if (window.Telegram) return resolve();
  const script = document.createElement("script");
  script.src = "https://telegram.org/js/telegram-web-app.js";
  script.onload = () => resolve();
  script.onerror = reject;
  document.head.append(script);
});

function paint(app: WebApp) {
  const root = document.documentElement;
  root.dataset.theme = app.colorScheme;
  const page = getComputedStyle(root).getPropertyValue("--page").trim();
  if (app.isVersionAtLeast("6.1")) { app.setHeaderColor(page); app.setBackgroundColor(page); }
  if (app.isVersionAtLeast("7.10")) app.setBottomBarColor?.(page);
}

function fitInsets(app: WebApp) {
  const top = (app.safeAreaInset?.top ?? 0) + (app.contentSafeAreaInset?.top ?? 0);
  const style = document.documentElement.style;
  style.setProperty("--tg-top", `${top}px`);
  style.setProperty("--tg-bottom", `${app.safeAreaInset?.bottom ?? 0}px`);
}

/** Files stay in the app, Telegram links open in Telegram and other sites leave through it. */
function onClick(app: WebApp, event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (target.closest(".key, .chip, .tab, .tabbar a")) app.HapticFeedback?.impactOccurred("light");
  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (!link) return;
  const url = new URL(link.href);
  if (url.hostname === "t.me") { event.preventDefault(); app.openTelegramLink(url.href); }
  else if (url.origin === location.origin && /^\/files\/[0-9a-f-]{36}$/.test(url.pathname)) {
    event.preventDefault();
    document.dispatchEvent(new CustomEvent("tg-file", { detail: { id: url.pathname.split("/")[2], name: link.dataset.name ?? "file.pdf" } }));
  } else if (url.protocol.startsWith("http") && url.origin !== location.origin) { event.preventDefault(); app.openLink(url.href, { try_instant_view: true }); }
}

export function TelegramApp({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const back = useRef(() => router.back());

  useEffect(() => {
    if (!launched()) return;
    let cancelled = false;
    loadSdk().then(() => {
      const app = window.Telegram?.WebApp;
      if (cancelled || !app) return;
      document.documentElement.classList.add("tg");
      app.ready();
      app.expand();
      if (app.isVersionAtLeast("7.7")) app.disableVerticalSwipes?.();
      if (app.isVersionAtLeast("8.0") && (app.platform === "ios" || app.platform === "android")) app.requestFullscreen?.();
      if (app.isVersionAtLeast("7.0")) { app.SettingsButton?.onClick(() => router.push("/me")); app.SettingsButton?.show(); }
      const start = startPath(app.initDataUnsafe?.start_param);
      if (start) router.replace(start);
      const file = new URLSearchParams(location.search).get("open");
      if (file) document.dispatchEvent(new CustomEvent("tg-file", { detail: { id: file, name: "Press F file.pdf" } }));
      paint(app);
      fitInsets(app);
      app.onEvent("themeChanged", () => paint(app));
      app.onEvent("safeAreaChanged", () => fitInsets(app));
      app.onEvent("contentSafeAreaChanged", () => fitInsets(app));
      app.onEvent("fullscreenChanged", () => fitInsets(app));
      app.BackButton.onClick(() => back.current());
      document.addEventListener("click", (event) => onClick(app, event), true);
      if (!signedIn && app.initData) {
        const login = () => signIn("telegram", { initData: app.initData, redirect: false }).then((result) => { if (result?.ok) router.refresh(); });
        login();
        app.onEvent("activated", login);
      }
      document.dispatchEvent(new Event("tg-ready"));
    }).catch(() => { /* an ordinary browser tab */ });
    return () => { cancelled = true; };
  }, [router, signedIn]);

  useEffect(() => {
    const show = () => {
      const button = webApp()?.BackButton;
      if (path === "/") button?.hide(); else button?.show();
    };
    show();
    document.addEventListener("tg-ready", show);
    return () => document.removeEventListener("tg-ready", show);
  }, [path]);

  return <FileViewer />;
}
