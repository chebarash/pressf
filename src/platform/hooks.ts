"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import type { Platform } from "./server";
import { backButton, mainButton, secondaryButton, telegramReady, type BottomButton } from "./store";
import { webApp } from "./telegram";

export type PlatformInfo = {
  /** What the server rendered for: "telegram" | "mobile-web" | "desktop". */
  kind: Platform;
  /** Mobile frame (Telegram or a phone browser). */
  mobile: boolean;
  /** Running inside the Telegram Mini App (known before the SDK loads). */
  telegram: boolean;
  signedIn: boolean;
};

export const PlatformContext = createContext<PlatformInfo>({ kind: "desktop", mobile: false, telegram: false, signedIn: false });

/** Which front end is showing. Stable from the first render (no flash). */
export const usePlatform = () => useContext(PlatformContext);

/** True once the Telegram SDK is set up (always false outside Telegram). */
export const useTelegramReady = () => useSyncExternalStore(telegramReady.subscribe, telegramReady.get, () => false);

type ButtonOptions = Omit<BottomButton, "onClick"> & { onClick: () => void };

// Buttons stack: a sheet opened over a screen shows its own button and the
// screen's comes back when the sheet closes. The newest owner wins.
const stacks = new Map<typeof mainButton, { id: number; button: BottomButton }[]>();
let nextId = 0;

function publish(store: typeof mainButton) {
  const stack = stacks.get(store) ?? [];
  store.set(stack.at(-1)?.button ?? null);
}

function useBottomButton(store: typeof mainButton, options: ButtonOptions | null | false) {
  const click = useRef<() => void>(() => {});
  const id = useRef(-1);
  useEffect(() => {
    if (options) click.current = options.onClick;
  });
  const text = options ? options.text : null;
  const disabled = options ? !!options.disabled : false;
  const loading = options ? !!options.loading : false;
  const shine = options ? !!options.shine : false;
  const position = options ? options.position : undefined;
  useEffect(() => {
    if (text === null) return;
    if (id.current < 0) id.current = nextId++;
    const mine = id.current;
    const button: BottomButton = { text, disabled, loading, shine, position, onClick: () => click.current() };
    const stack = stacks.get(store) ?? [];
    const at = stack.findIndex((e) => e.id === mine);
    if (at >= 0) stack[at] = { id: mine, button };
    else stack.push({ id: mine, button });
    stacks.set(store, stack);
    publish(store);
    return () => {
      // Only drop the entry on unmount/hide; an update re-inserts in place.
      queueMicrotask(() => {
        const current = stacks.get(store) ?? [];
        const entry = current.find((e) => e.id === mine);
        if (entry && entry.button === button) {
          stacks.set(store, current.filter((e) => e.id !== mine));
          publish(store);
        }
      });
    };
  }, [store, text, disabled, loading, shine, position]);
  useEffect(() => () => { id.current = -1; }, []);
}

/**
 * The screen's one primary action. Telegram's native MainButton in the Mini App,
 * a sticky bottom button in a phone browser, and a regular button in the
 * desktop bottom bar. Pass null/false to hide it.
 *
 *   useMainButton({ text: "Sign in", onClick: submit, loading: busy })
 */
export const useMainButton = (options: ButtonOptions | null | false) => useBottomButton(mainButton, options);

/** Second bottom action (e.g. "Not now" next to "Add to home screen", 1.9). */
export const useSecondaryButton = (options: ButtonOptions | null | false) => useBottomButton(secondaryButton, options);

/** Current bottom buttons (for the web fallback renderer). */
export const useBottomButtons = () => ({
  main: useSyncExternalStore(mainButton.subscribe, mainButton.get, () => null),
  secondary: useSyncExternalStore(secondaryButton.subscribe, secondaryButton.get, () => null),
});

/**
 * Shows Telegram's BackButton while the component is mounted. Default action:
 * router.back(). Pass false to hide it (e.g. on a root screen). No-op on the web
 * (the browser has its own back).
 */
export function useBackButton(onBack?: (() => void) | false) {
  const router = useRouter();
  const handler = useRef<() => void>(() => router.back());
  useEffect(() => {
    handler.current = onBack || (() => router.back());
  });
  const visible = onBack !== false;
  useEffect(() => {
    const mine = { visible, onBack: () => handler.current() };
    backButton.set(mine);
    return () => {
      if (backButton.get() === mine) backButton.set(null);
    };
  }, [visible]);
}

/** Wires Telegram's ⋯ → Settings item while mounted (the shell points it at /me). */
export function useSettingsButton(onClick: () => void) {
  const ready = useTelegramReady();
  const handler = useRef(onClick);
  useEffect(() => {
    handler.current = onClick;
  });
  useEffect(() => {
    const button = webApp()?.SettingsButton;
    if (!ready || !button) return;
    const click = () => handler.current();
    button.onClick(click);
    button.show();
    return () => {
      button.offClick(click);
    };
  }, [ready]);
}
