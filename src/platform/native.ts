/**
 * Imperative Telegram features with web fallbacks. Call these from event
 * handlers in client components; each one does the right thing outside
 * Telegram (an in-app dialog, localStorage, a normal link) so screens never
 * branch on the platform themselves.
 */
import { BOT_USERNAME, startParam, uploadLink, webUrl, type Target } from "@/core/links";
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

/** Native download sheet in Telegram (8.0+), a plain download link elsewhere. Resolves once Telegram's sheet is answered. */
export function downloadFile(url: string, fileName: string): Promise<void> {
  const app = webApp();
  const absolute = new URL(url, location.href).href;
  if (app?.downloadFile && supports("8.0")) {
    return new Promise((resolve) => {
      try {
        app.downloadFile!({ url: absolute, file_name: fileName }, () => resolve());
      } catch {
        resolve();
      }
    });
  }
  const a = document.createElement("a");
  a.href = absolute;
  a.download = fileName;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  return Promise.resolve();
}

/** How a Download went (for tests and callers that care). */
export type FileDelivery = "chat" | "download" | "busy";

/** Files sent (or being sent) to the chat in the last 10 s: a second tap does nothing. */
const recentSends = new Map<string, number>();
const RESEND_MS = 10_000;

/**
 * Download in the Mini App: the bot sends the branded file into the student's
 * chat (POST /api/telegram/send-file), a popup says so and offers "Open chat",
 * and the student stays on the page. A tap within 10 s of the last one does
 * nothing (the server dedupes too). When the bot can't send it (never started
 * or blocked: 403 no_access; too big; not linked; any failure) the file
 * downloads as before, and for no_access a popup asks them to press Start.
 * Outside Telegram: a plain download. `settled` runs once the request is answered
 * (the MainButton's progress ends there, before any popup).
 */
export async function downloadToChat(id: string, url: string, fileName: string, settled?: () => void): Promise<FileDelivery> {
  const app = webApp();
  if (!app?.initData) {
    await downloadFile(url, fileName);
    return "download";
  }
  const last = recentSends.get(id);
  if (last !== undefined && Date.now() - last < RESEND_MS) return "busy";
  recentSends.set(id, Date.now());

  const error = await post("/api/telegram/send-file", { id, initData: app.initData }).then(
    async (r) => (r.ok ? null : (((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "failed")),
    () => "failed",
  );
  settled?.();
  if (!error) {
    haptic.notify("success");
    const pressed = await popup({
      message: `Sent to your chat with @${BOT_USERNAME}.`,
      buttons: [{ id: "open", text: "Open chat" }, { id: "ok", text: "OK" }],
    }).catch(() => null);
    if (pressed === "open") openTelegramLink(`https://t.me/${BOT_USERNAME}`);
    return "chat";
  }

  recentSends.delete(id);
  await downloadFile(url, fileName);
  if (error === "no_access") {
    const pressed = await popup({
      title: "Get files in your chat",
      message: `Press Start in @${BOT_USERNAME} and next time Download sends the file straight to your chat.`,
      buttons: [{ id: "start", text: "Open bot" }, { id: "later", text: "Later", type: "cancel" }],
    }).catch(() => null);
    if (pressed === "start") openTelegramLink(`https://t.me/${BOT_USERNAME}`);
  }
  return "download";
}

/** A link to the bot's own chat (t.me/pressfapp, ?start=…), not to its Mini App (?startapp=…). */
const isBotChat = (url: string) => {
  try {
    const u = new URL(url);
    return u.hostname === "t.me" && u.pathname.replace(/\/$/, "").toLowerCase() === `/${BOT_USERNAME}` && !u.searchParams.has("startapp");
  } catch {
    return false;
  }
};

/** t.me links stay inside Telegram; a new tab elsewhere. The bot's own chat closes the Mini App so it shows. */
export function openTelegramLink(url: string) {
  const app = webApp();
  if (app && isBotChat(url)) return openBotChat(app, url);
  if (app) return app.openTelegramLink(url);
  window.open(url, "_blank", "noopener");
}

/** How a share went out (for tests and callers that care). */
export type ShareRoute = "prepared" | "inline" | "link" | "web-share" | "copy" | "tab" | "none";

const shareLink = (pageUrl: string, text?: string) =>
  `https://t.me/share/url?url=${encodeURIComponent(pageUrl)}${text ? `&text=${encodeURIComponent(text)}` : ""}`;

const post = (url: string, body: object) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });

/** The bot's share card prepared for this user (POST /api/telegram/share), or null when that fails. */
async function prepareShare(target: Target, initData: string): Promise<{ id: string; receipt: string } | null> {
  const ref = target.to === "course" ? { kind: "course", id: target.code } : target.to === "file" || target.to === "professor" ? { kind: target.to, id: target.id } : null;
  if (!ref) return null;
  try {
    const response = await post("/api/telegram/share", { ...ref, initData });
    if (!response.ok) return null;
    const body = (await response.json()) as { id?: string; receipt?: string };
    return body.id && body.receipt ? { id: body.id, receipt: body.receipt } : null;
  } catch {
    return null;
  }
}

/**
 * Share a Press F page (course, file, professor), the ways Telegram designed, in order:
 * 1. Bot API 8.0+: the bot prepares its rich card for this user
 *    (savePreparedInlineMessage) and WebApp.shareMessage opens the chat picker;
 *    a sent message is counted (prepared messages get no chosen_inline_result).
 * 2. Bot API 6.7+: switchInlineQuery with "c_MATH111" typed in (inline mode; counted by the webhook).
 * 3. Older Telegram: a t.me/share link to the page.
 * Outside Telegram: the system share sheet, else copy the link, else t.me/share in a new tab.
 */
export async function shareTarget(target: Target, text?: string): Promise<ShareRoute> {
  const pageUrl = webUrl(target);
  const app = webApp();
  if (app) {
    if (app.shareMessage && app.isVersionAtLeast("8.0")) {
      const prepared = await prepareShare(target, app.initData);
      if (prepared) {
        try {
          app.shareMessage(prepared.id, (sent) => {
            if (sent) void post("/api/telegram/share", { sent: prepared.receipt }).catch(() => {});
          });
          return "prepared";
        } catch {
          // Fall through to inline mode.
        }
      }
    }
    if (app.switchInlineQuery && app.isVersionAtLeast("6.7")) {
      try {
        app.switchInlineQuery(startParam(target), ["users", "groups", "channels"]);
        return "inline";
      } catch {
        // Inline mode off for the bot: fall through to the plain share link.
      }
    }
    app.openTelegramLink(shareLink(pageUrl, text));
    return "link";
  }
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ url: pageUrl, text });
      return "web-share";
    } catch (error) {
      // Closing the sheet is a choice, not a failure.
      if (error instanceof Error && error.name === "AbortError") return "none";
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(pageUrl);
      void popup({ message: "Link copied", buttons: [{ id: "ok", text: "OK" }] });
      return "copy";
    } catch {
      // Clipboard blocked: open the share link instead.
    }
  }
  window.open(shareLink(pageUrl, text), "_blank", "noopener");
  return "tab";
}

/** Opens the bot's own chat from its Mini App: the chat opens under the Mini App, so close the Mini App to land in it. */
function openBotChat(app: NonNullable<ReturnType<typeof webApp>>, url: string) {
  app.openTelegramLink(url);
  setTimeout(() => app.close(), 150);
}

/**
 * "Share a file via the bot" for a course. In the Mini App the bot writes the
 * upload prompt (course picked) into the student's chat, then the chat opens
 * and the Mini App closes. If the bot can't write to them yet, the
 * t.me/<bot>?start=upload_<CODE> link starts the same flow. Elsewhere, the link in a new tab.
 */
export async function uploadViaBot(courseCode: string): Promise<"sent" | "link" | "tab"> {
  const app = webApp();
  if (!app) {
    window.open(uploadLink(courseCode), "_blank", "noopener");
    return "tab";
  }
  const ok = await post("/api/telegram/upload", { code: courseCode }).then((r) => r.ok, () => false);
  openBotChat(app, ok ? `https://t.me/${BOT_USERNAME}` : uploadLink(courseCode));
  return ok ? "sent" : "link";
}

/** External sites leave through Telegram's browser; a new tab elsewhere. */
export function openLink(url: string, opts: { tryInstantView?: boolean } = {}) {
  const app = webApp();
  if (app) return app.openLink(url, { try_instant_view: opts.tryInstantView ?? true });
  window.open(url, "_blank", "noopener");
}

export const closeMiniApp = () => webApp()?.close();
