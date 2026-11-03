"use client";

import { signIn } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { parseStartParam, path as pathFor } from "@/core/links";
import { usePlatform } from "./hooks";
import { backButton, mainButton, secondaryButton, telegramReady, type BottomButton } from "./store";
import { token, whenWebApp, type NativeBottomButton, type WebApp } from "./telegram";

/** Paints Telegram's chrome in our page colour and follows its theme. */
function paint(app: WebApp) {
  const root = document.documentElement;
  let stored: string | null = null;
  try { stored = localStorage.getItem("pf_theme"); } catch { /* storage blocked */ }
  if (!stored) root.dataset.theme = app.colorScheme;
  const page = token("--bg-page");
  if (app.isVersionAtLeast("6.1")) {
    app.setHeaderColor(page);
    app.setBackgroundColor(page);
  }
  if (app.isVersionAtLeast("7.10")) app.setBottomBarColor?.(page);
}

/** safeAreaInset (notch) + contentSafeAreaInset (Telegram's pills) as CSS vars. */
function insets(app: WebApp) {
  const style = document.documentElement.style;
  const safe = app.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const content = app.contentSafeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
  style.setProperty("--tg-safe-top", `${safe.top}px`);
  style.setProperty("--tg-safe-bottom", `${safe.bottom}px`);
  style.setProperty("--tg-content-top", `${content.top}px`);
  style.setProperty("--tg-content-bottom", `${content.bottom}px`);
  style.setProperty("--tg-top", `${safe.top + content.top}px`);
  style.setProperty("--tg-bottom", `${safe.bottom + content.bottom}px`);
}

/** Mirrors a store button onto a native bottom button. */
function syncButton(native: NativeBottomButton | undefined, button: BottomButton | null, last: { current: (() => void) | null }, secondary: boolean) {
  if (!native) return;
  if (last.current) native.offClick(last.current);
  last.current = null;
  if (!button) {
    native.hideProgress();
    native.hide();
    return;
  }
  const enabled = !button.disabled;
  native.setParams({
    text: button.text,
    color: token(secondary ? "--bg-accent-soft" : "--bg-accent"),
    text_color: token(secondary ? "--text-accent" : "--text-on-accent"),
    has_shine_effect: !!button.shine,
    is_active: enabled,
    is_visible: true,
    ...(secondary && button.position ? { position: button.position } : {}),
  });
  if (button.loading) native.showProgress(false);
  else native.hideProgress();
  const click = () => { if (!button.loading && enabled) button.onClick(); };
  native.onClick(click);
  last.current = click;
}

/**
 * Sets up the Mini App once the SDK arrives: fullscreen, no swipe-to-close,
 * insets, colours, native buttons, the start link and silent sign-in. Renders
 * nothing; the shell has already painted.
 */
export function TelegramBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const { kind, signedIn } = usePlatform();
  const pathRef = useRef(pathname);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    // A stale Telegram cookie in an ordinary tab (the boot script cleared it): re-render as web.
    if (kind === "telegram" && !document.documentElement.classList.contains("tg")) router.refresh();
    whenWebApp().then((app) => {
      if (cancelled || !app) return;
      app.ready();
      app.expand();
      if (app.isVersionAtLeast("7.7")) app.disableVerticalSwipes?.();
      if (app.isVersionAtLeast("8.0") && (app.platform === "ios" || app.platform === "android")) app.requestFullscreen?.();
      paint(app);
      insets(app);
      const onTheme = () => paint(app);
      const onInsets = () => insets(app);
      app.onEvent("themeChanged", onTheme);
      for (const e of ["safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged", "viewportChanged"]) app.onEvent(e, onInsets);
      cleanups.push(() => {
        app.offEvent("themeChanged", onTheme);
        for (const e of ["safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged", "viewportChanged"]) app.offEvent(e, onInsets);
      });

      // Native bottom buttons follow the store.
      const lastMain = { current: null as (() => void) | null };
      const lastSecondary = { current: null as (() => void) | null };
      const syncMain = () => syncButton(app.MainButton, mainButton.get(), lastMain, false);
      const syncSecondary = () => syncButton(app.isVersionAtLeast("7.10") ? app.SecondaryButton : undefined, secondaryButton.get(), lastSecondary, true);
      syncMain();
      syncSecondary();
      cleanups.push(mainButton.subscribe(syncMain), secondaryButton.subscribe(syncSecondary));

      // Back: a screen override, else shown off the root and going back.
      const back = () => {
        const override = backButton.get();
        if (override?.onBack) override.onBack();
        else router.back();
      };
      app.BackButton.onClick(back);
      cleanups.push(() => app.BackButton.offClick(back));

      // ⋯ → Settings opens the profile.
      if (app.isVersionAtLeast("7.0") && app.SettingsButton) {
        const settings = () => router.push("/me");
        app.SettingsButton.onClick(settings);
        app.SettingsButton.show();
        cleanups.push(() => app.SettingsButton?.offClick(settings));
      }

      // t.me links stay in Telegram, other sites open in its browser.
      const onClick = (event: MouseEvent) => {
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
        if (!link || event.defaultPrevented) return;
        const url = new URL(link.href);
        if (url.hostname === "t.me") { event.preventDefault(); app.openTelegramLink(url.href); }
        else if (url.protocol.startsWith("http") && url.origin !== location.origin) { event.preventDefault(); app.openLink(url.href, { try_instant_view: true }); }
      };
      document.addEventListener("click", onClick, true);
      cleanups.push(() => document.removeEventListener("click", onClick, true));

      // startapp=… → the matching page (once per launch).
      const start = parseStartParam(app.initDataUnsafe?.start_param);
      let handled = false;
      try { handled = sessionStorage.getItem("pf_start") === "1"; sessionStorage.setItem("pf_start", "1"); } catch { /* storage blocked */ }
      if (!handled && start.to !== "today") {
        const target = pathFor(start);
        if (target !== pathRef.current) router.replace(target);
      }

      // Signed-in session from the linked Telegram account, without blocking paint.
      if (!signedIn && app.initData && start.to !== "link") {
        signIn("telegram", { initData: app.initData, redirect: false })
          .then((result) => { if (result?.ok && !result.error) router.refresh(); })
          .catch(() => { /* stays a guest */ });
      }

      // The server picked the frame from the user agent before the cookie existed.
      if (kind !== "telegram") router.refresh();
      telegramReady.set(true);
    });
    return () => {
      cancelled = true;
      cleanups.forEach((c) => c());
    };
    // Set up once per page load; the session/platform props only matter at launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // BackButton visibility follows the route and any screen override.
  useEffect(() => {
    const update = () => {
      const app = window.Telegram?.WebApp;
      if (!telegramReady.get() || !app) return;
      const override = backButton.get();
      const visible = override ? override.visible : pathname !== "/";
      if (visible) app.BackButton.show();
      else app.BackButton.hide();
    };
    update();
    const a = backButton.subscribe(update);
    const b = telegramReady.subscribe(update);
    return () => { a(); b(); };
  }, [pathname]);

  return null;
}
