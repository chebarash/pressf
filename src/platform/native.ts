/**
 * Imperative Telegram features with web fallbacks. Call these from event
 * handlers in client components; each one does the right thing outside
 * Telegram (an in-app dialog, localStorage, a normal link) so screens never
 * branch on the platform themselves.
 */
import { dialog } from "./store";
import { supports, webApp, type HomeScreenStatus, type PopupButton } from "./telegram";

export const haptic = {
  impact(style: "light" | "medium" | "heavy" | "rigid" | "soft" = "light") {
    webApp()?.HapticFeedback?.impactOccurred(style);
  },
  notify(type: "success" | "error" | "warning") {
    webApp()?.HapticFeedback?.notificationOccurred(type);
  },
  select() {
    webApp()?.HapticFeedback?.selectionChanged();
  },
};

/** Native confirm in Telegram (8.2), the shell's confirm dialog elsewhere. */
export function confirm(message: string, options: { title?: string; ok?: string; cancel?: string; destructive?: boolean } = {}): Promise<boolean> {
  const app = webApp();
  if (app?.showPopup && supports("6.2")) {
    return new Promise((resolve) =>
      app.showPopup!(
        {
          title: options.title,
          message,
          buttons: [
            { id: "cancel", type: "cancel", text: options.cancel },
            { id: "ok", type: options.destructive ? "destructive" : "default", text: options.ok ?? "OK" },
          ],
        },
        (id) => resolve(id === "ok"),
      ),
    );
  }
  return new Promise((resolve) => dialog.set({ kind: "confirm", message, ...options, resolve }));
}

/** A popup with up to three buttons; resolves with the pressed button id or null. */
export function popup(params: { title?: string; message: string; buttons: { id: string; text: string; type?: "default" | "destructive" | "cancel" }[] }): Promise<string | null> {
  const app = webApp();
  if (app?.showPopup && supports("6.2")) {
    const buttons: PopupButton[] = params.buttons.map((b) => (b.type === "cancel" ? { id: b.id, type: "cancel" } : { id: b.id, type: b.type ?? "default", text: b.text }));
    return new Promise((resolve) => app.showPopup!({ title: params.title, message: params.message, buttons }, (id) => resolve(id || null)));
  }
  return new Promise((resolve) => dialog.set({ kind: "popup", ...params, resolve }));
}

/**
 * Opens Telegram's QR scanner. `onScan` gets each scanned text and returns true
 * to close the scanner. Returns false when there is no native scanner (the
 * caller then falls back to its own camera UI).
 */
export function scanQr(text: string, onScan: (value: string) => boolean | Promise<boolean>): boolean {
  const app = webApp();
  if (!app?.showScanQrPopup || !supports("6.4")) return false;
  app.showScanQrPopup({ text }, (value) => {
    void Promise.resolve(onScan(value)).then((close) => { if (close) app.closeScanQrPopup?.(); });
    return false;
  });
  return true;
}

export const closeScanQr = () => webApp()?.closeScanQrPopup?.();

/** Telegram CloudStorage (synced across the user's devices), localStorage on the web. */
export const cloudStorage = {
  get(key: string): Promise<string | null> {
    const store = supports("6.9") ? webApp()?.CloudStorage : undefined;
    if (store) return new Promise((resolve) => store.getItem(key, (error, value) => resolve(error ? null : value || null)));
    try { return Promise.resolve(localStorage.getItem(`pf_cs_${key}`)); } catch { return Promise.resolve(null); }
  },
  set(key: string, value: string): Promise<void> {
    const store = supports("6.9") ? webApp()?.CloudStorage : undefined;
    if (store) return new Promise((resolve) => store.setItem(key, value, () => resolve()));
    try { localStorage.setItem(`pf_cs_${key}`, value); } catch { /* storage blocked */ }
    return Promise.resolve();
  },
  remove(key: string): Promise<void> {
    const store = supports("6.9") ? webApp()?.CloudStorage : undefined;
    if (store) return new Promise((resolve) => store.removeItem(key, () => resolve()));
    try { localStorage.removeItem(`pf_cs_${key}`); } catch { /* storage blocked */ }
    return Promise.resolve();
  },
};

/** "added" | "missed" | "unknown" | "unsupported" (always "unsupported" outside Telegram). */
export function homeScreenStatus(): Promise<HomeScreenStatus> {
  const app = webApp();
  if (!app?.checkHomeScreenStatus || !supports("8.0")) return Promise.resolve("unsupported");
  return new Promise((resolve) => app.checkHomeScreenStatus!((status) => resolve(status)));
}

/** Asks Telegram to add the Mini App to the home screen (1.9). */
export function addToHomeScreen(): boolean {
  const app = webApp();
  if (!app?.addToHomeScreen || !supports("8.0")) return false;
  app.addToHomeScreen();
  return true;
}

/** Asks the user to let the bot message them (1.8). Resolves false on the web. */
export function requestWriteAccess(): Promise<boolean> {
  const app = webApp();
  if (!app?.requestWriteAccess || !supports("6.9")) return Promise.resolve(false);
  return new Promise((resolve) => app.requestWriteAccess!((allowed) => resolve(allowed)));
}

/** Native download sheet in Telegram (8.0+), a plain download link elsewhere. */
export function downloadFile(url: string, fileName: string) {
  const app = webApp();
  const absolute = new URL(url, location.href).href;
  if (app?.downloadFile && supports("8.0")) return app.downloadFile({ url: absolute, file_name: fileName });
  const a = document.createElement("a");
  a.href = absolute;
  a.download = fileName;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
}

/** t.me links stay inside Telegram; a new tab elsewhere. */
export function openTelegramLink(url: string) {
  const app = webApp();
  if (app) return app.openTelegramLink(url);
  window.open(url, "_blank", "noopener");
}

/**
 * Share a Press F page. In the Mini App: Telegram's chat picker with the bot's
 * inline query typed in ("c_MATH111"), so the message is the bot's rich card and
 * the send is counted. Elsewhere (or an old Telegram): a t.me/share link to the page.
 */
export function shareInline(query: string, pageUrl: string, text?: string) {
  const app = webApp();
  if (app?.switchInlineQuery && app.isVersionAtLeast("6.7")) {
    try {
      return app.switchInlineQuery(query, ["users", "groups", "channels"]);
    } catch {
      // Inline mode off for the bot: fall through to the plain share link.
    }
  }
  const share = `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  if (app) return app.openTelegramLink(share);
  window.open(share, "_blank", "noopener");
}

/** External sites leave through Telegram's browser; a new tab elsewhere. */
export function openLink(url: string) {
  const app = webApp();
  if (app) return app.openLink(url, { try_instant_view: true });
  window.open(url, "_blank", "noopener");
}

export const closeMiniApp = () => webApp()?.close();
