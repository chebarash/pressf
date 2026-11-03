/**
 * Typed access to Telegram's Mini App SDK (telegram-web-app.js). The SDK is
 * injected by the boot script only inside Telegram, so everything here returns
 * null / falls back in an ordinary browser tab.
 * https://core.telegram.org/bots/webapps
 */

type Insets = { top: number; bottom: number; left: number; right: number };
type Handler = (...args: never[]) => void;

export type BottomButtonParams = {
  text?: string;
  color?: string;
  text_color?: string;
  has_shine_effect?: boolean;
  position?: "left" | "right" | "top" | "bottom";
  is_active?: boolean;
  is_visible?: boolean;
};

export type NativeBottomButton = {
  setParams(params: BottomButtonParams): NativeBottomButton;
  onClick(handler: () => void): void;
  offClick(handler: () => void): void;
  show(): void;
  hide(): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
};

export type PopupButton = { id?: string; type?: "default" | "ok" | "close" | "cancel" | "destructive"; text?: string };
export type PopupParams = { title?: string; message: string; buttons?: PopupButton[] };
export type HomeScreenStatus = "unsupported" | "unknown" | "added" | "missed";

export type WebApp = {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name?: string } };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  isFullscreen?: boolean;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  close(): void;
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent(name: string, handler: Handler): void;
  offEvent(name: string, handler: Handler): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  /** Bot API 6.7+: opens the chat picker with "@bot query" typed in (needs inline mode on in BotFather). */
  switchInlineQuery?(query: string, chooseChatTypes?: Array<"users" | "bots" | "groups" | "channels">): void;
  showPopup?(params: PopupParams, callback?: (id: string) => void): void;
  showConfirm?(message: string, callback?: (ok: boolean) => void): void;
  showScanQrPopup?(params: { text?: string }, callback?: (text: string) => boolean | void): void;
  closeScanQrPopup?(): void;
  requestWriteAccess?(callback?: (allowed: boolean) => void): void;
  addToHomeScreen?(): void;
  checkHomeScreenStatus?(callback?: (status: HomeScreenStatus) => void): void;
  downloadFile?(params: { url: string; file_name: string }, callback?: (accepted: boolean) => void): void;
  MainButton: NativeBottomButton;
  SecondaryButton?: NativeBottomButton;
  BackButton: { show(): void; hide(): void; onClick(handler: () => void): void; offClick(handler: () => void): void };
  SettingsButton?: { show(): void; hide(): void; onClick(handler: () => void): void; offClick(handler: () => void): void };
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "success" | "error" | "warning"): void;
    selectionChanged(): void;
  };
  CloudStorage?: {
    setItem(key: string, value: string, callback?: (error: string | null, ok?: boolean) => void): void;
    getItem(key: string, callback: (error: string | null, value?: string) => void): void;
    removeItem(key: string, callback?: (error: string | null, ok?: boolean) => void): void;
  };
};

declare global {
  interface Window { Telegram?: { WebApp?: WebApp } }
}

/** True when the page was launched as a Mini App (set by the boot script). */
export const inTelegram = () => typeof document !== "undefined" && document.documentElement.classList.contains("tg");

/** The SDK object once it is loaded and we are inside Telegram, else null. */
export function webApp(): WebApp | null {
  if (!inTelegram()) return null;
  const app = window.Telegram?.WebApp;
  return app && app.initData !== undefined ? app : null;
}

/** Resolves with the SDK once the script has loaded (null outside Telegram or on failure). */
export function whenWebApp(timeoutMs = 8000): Promise<WebApp | null> {
  if (!inTelegram()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const app = window.Telegram?.WebApp;
      if (app) return resolve(app);
      if (Date.now() - started > timeoutMs) return resolve(null);
      setTimeout(tick, 16);
    };
    tick();
  });
}

export const supports = (version: string) => !!webApp()?.isVersionAtLeast(version);

/** Reads a design token (e.g. `--bg-page`) as a hex colour for the native chrome. */
export function token(name: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Telegram accepts #RRGGBB only; drop an alpha suffix if a token has one.
  return /^#[0-9a-f]{8}$/i.test(raw) ? raw.slice(0, 7) : raw;
}
