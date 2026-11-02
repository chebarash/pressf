"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The bits of the Telegram Mini App API these screens use: MainButton,
 * SecondaryButton, the QR scanner, haptics and home-screen shortcuts. Every
 * call is a no-op outside Telegram, so the same screen works in a browser.
 */

type BottomButton = {
  setParams(p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean; has_shine_effect?: boolean; position?: string }): void;
  show(): void;
  hide(): void;
  onClick(h: () => void): void;
  offClick(h: () => void): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
};

type TgWebApp = {
  initData: string;
  version?: string;
  isVersionAtLeast?(v: string): boolean;
  MainButton?: BottomButton;
  SecondaryButton?: BottomButton;
  HapticFeedback?: { notificationOccurred(t: "success" | "error" | "warning"): void; impactOccurred(s: "light" | "medium"): void };
  showScanQrPopup?(p: { text?: string }, cb?: (text: string) => boolean | void): void;
  closeScanQrPopup?(): void;
  onEvent?(name: string, h: (...args: unknown[]) => void): void;
  offEvent?(name: string, h: (...args: unknown[]) => void): void;
  addToHomeScreen?(): void;
  checkHomeScreenStatus?(cb: (status: string) => void): void;
};

export function webApp(): TgWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  const app = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  return app && app.initData ? app : undefined;
}

/** True after mount when running inside Telegram (false on the server and in browsers). */
export function useInTelegram() {
  const [inside, setInside] = useState(false);
  useEffect(() => {
    const check = () => setInside(!!webApp());
    check();
    // The SDK may still be loading on first paint.
    const t = setTimeout(check, 400);
    return () => clearTimeout(t);
  }, []);
  return inside;
}

export const haptic = (type: "success" | "error" | "warning") => webApp()?.HapticFeedback?.notificationOccurred(type);
export const tap = () => webApp()?.HapticFeedback?.impactOccurred("light");

const cssVar = (name: string) => (typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue(name).trim());

/**
 * Drives Telegram's MainButton (or SecondaryButton). Returns whether Telegram
 * shows it, so the caller renders its own bottom bar otherwise.
 */
export function useBottomButton(kind: "main" | "secondary", opts: { text: string; visible: boolean; shine?: boolean; busy?: boolean; onClick: () => void }) {
  const inside = useInTelegram();
  const handler = useRef(opts.onClick);
  useEffect(() => {
    handler.current = opts.onClick;
  });
  const { text, visible, shine, busy } = opts;
  useEffect(() => {
    if (!inside) return;
    const app = webApp();
    const button = kind === "main" ? app?.MainButton : app?.SecondaryButton;
    if (!button) return;
    const click = () => handler.current();
    button.setParams({
      text,
      color: kind === "main" ? cssVar("--bg-accent") : cssVar("--bg-accent-soft"),
      text_color: kind === "main" ? cssVar("--text-on-accent") : cssVar("--text-accent"),
      is_visible: visible,
      is_active: !busy,
      ...(app?.isVersionAtLeast?.("7.10") ? { has_shine_effect: !!shine } : {}),
      ...(kind === "secondary" ? { position: "left" } : {}),
    });
    if (busy) button.showProgress(false);
    else button.hideProgress();
    button.onClick(click);
    return () => {
      button.offClick(click);
    };
  }, [inside, kind, text, visible, shine, busy]);
  useEffect(() => {
    if (!inside) return;
    const app = webApp();
    const button = kind === "main" ? app?.MainButton : app?.SecondaryButton;
    return () => button?.hide();
  }, [inside, kind]);
  return inside;
}

export type ScanResult = { kind: "text"; text: string } | { kind: "closed" } | { kind: "camera-off" } | { kind: "unsupported" };

/**
 * Opens Telegram's native scanner and resolves with the first code read. A
 * popup that closes almost instantly without a code means Telegram could not
 * open the camera (permission denied), which Telegram does not report directly.
 */
export function scanQr(text: string): Promise<ScanResult> {
  const app = webApp();
  if (!app?.showScanQrPopup || (app.isVersionAtLeast && !app.isVersionAtLeast("6.4"))) return Promise.resolve({ kind: "unsupported" });
  return new Promise((resolve) => {
    const opened = Date.now();
    let done = false;
    const finish = (r: ScanResult) => {
      if (done) return;
      done = true;
      app.offEvent?.("scanQrPopupClosed", onClosed);
      resolve(r);
    };
    const onClosed = () => finish(Date.now() - opened < 500 ? { kind: "camera-off" } : { kind: "closed" });
    app.onEvent?.("scanQrPopupClosed", onClosed);
    try {
      app.showScanQrPopup!({ text }, (value) => {
        finish({ kind: "text", text: value });
        return true; // close the popup
      });
    } catch {
      finish({ kind: "unsupported" });
    }
  });
}

/** "added" | "missed" | "unknown" | "unsupported" for the Scan QR home-screen shortcut. */
export function homeScreenStatus(): Promise<string> {
  const app = webApp();
  if (!app?.checkHomeScreenStatus) return Promise.resolve("unsupported");
  return new Promise((resolve) => app.checkHomeScreenStatus!(resolve));
}

/** Asks Telegram to add the shortcut; `onAdded` runs when the user confirms. */
export function addToHomeScreen(onAdded?: () => void) {
  const app = webApp();
  if (!app?.addToHomeScreen) return;
  if (onAdded) {
    const added = () => {
      app.offEvent?.("homeScreenAdded", added);
      onAdded();
    };
    app.onEvent?.("homeScreenAdded", added);
  }
  app.addToHomeScreen();
}
