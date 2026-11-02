"use client";

import { addToHomeScreen as add, haptic as platformHaptic, homeScreenStatus, scanQr as platformScan, webApp } from "@/platform/client";

/**
 * QR-specific glue over the shell's Telegram bridge: one scan as a promise
 * (with "camera off" detection, which Telegram does not report directly) and
 * the home-screen shortcut with a confirmation callback.
 */

export const haptic = (type: "success" | "error" | "warning") => platformHaptic.notify(type);

export { homeScreenStatus };

export type ScanResult = { kind: "text"; text: string } | { kind: "closed" } | { kind: "camera-off" } | { kind: "unsupported" };

/**
 * Opens Telegram's scanner and resolves with the first code read. A popup
 * that closes almost at once without a code means Telegram could not open
 * the camera (permission denied).
 */
export function scanQr(text: string): Promise<ScanResult> {
  return new Promise((resolve) => {
    const app = webApp();
    const opened = Date.now();
    let done = false;
    const finish = (r: ScanResult) => {
      if (done) return;
      done = true;
      app?.offEvent("scanQrPopupClosed", onClosed);
      resolve(r);
    };
    const onClosed = () => finish(Date.now() - opened < 500 ? { kind: "camera-off" } : { kind: "closed" });
    app?.onEvent("scanQrPopupClosed", onClosed);
    const shown = platformScan(text, (value) => {
      finish({ kind: "text", text: value });
      return true;
    });
    if (!shown) finish({ kind: "unsupported" });
  });
}

/** Asks Telegram for the shortcut; `onAdded` runs when the user confirms. */
export function addToHomeScreen(onAdded?: () => void) {
  const app = webApp();
  if (app && onAdded) {
    const added = () => {
      app.offEvent("homeScreenAdded", added);
      onAdded();
    };
    app.onEvent("homeScreenAdded", added);
  }
  add();
}
