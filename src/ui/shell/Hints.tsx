"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { pickHint, type HintContext, type HintScreen } from "@/core/hints";
import { openLink } from "@/platform/client";
import { dismissHintAction } from "./hint-actions";
import h from "./Hints.module.css";

/**
 * "First time here" hints (src/core/hints.ts). The shell knows which ones the
 * student dismissed (user_state.hints) and keeps that set for the session, so
 * a dismissed hint never comes back on another screen or after navigating;
 * guests keep theirs in localStorage. Each screen renders <ScreenHint> once,
 * under its title.
 */

const KEY = "pf_hints";
type Store = { signedIn: boolean; telegramLinked: boolean; dismissed: ReadonlySet<string>; ready: boolean; dismiss: (id: string) => void };
const Ctx = createContext<Store | null>(null);

const readLocal = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

export function HintsProvider({ signedIn, telegramLinked = false, dismissed, children }: { signedIn: boolean; telegramLinked?: boolean; /** From the server; null for guests. */ dismissed: string[] | null; children?: ReactNode }) {
  const [local, setLocal] = useState<string[]>([]);
  // Guests' dismissals live in this browser only; read after hydration so the server HTML matches.
  const [ready, setReady] = useState(signedIn);
  useEffect(() => {
    if (signedIn) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of browser storage after hydration
    setLocal(readLocal());
    setReady(true);
  }, [signedIn]);
  const set = useMemo(() => new Set([...(dismissed ?? []), ...local]), [dismissed, local]);
  const dismiss = useCallback(
    (id: string) => {
      setLocal((l) => (l.includes(id) ? l : [...l, id]));
      if (signedIn) void dismissHintAction(id).catch(() => {});
      else
        try {
          localStorage.setItem(KEY, JSON.stringify([...new Set([...readLocal(), id])]));
        } catch {
          /* storage blocked: gone for this visit only */
        }
    },
    [signedIn],
  );
  const value = useMemo(() => ({ signedIn, telegramLinked, dismissed: set, ready, dismiss }), [signedIn, telegramLinked, set, ready, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The one hint of a screen, if any is due: a sentence, one link, a ×. */
export function ScreenHint({ screen, ctx, className }: { screen: HintScreen; ctx: Omit<HintContext, "signedIn" | "telegramLinked">; className?: string }) {
  const store = useContext(Ctx);
  if (!store || !store.ready) return null;
  // The shell knows who is signed in and whether Telegram is linked.
  const full: HintContext = { ...ctx, signedIn: store.signedIn, telegramLinked: store.signedIn ? store.telegramLinked : undefined };
  const hint = pickHint(screen, full, store.dismissed);
  if (!hint) return null;
  const action = hint.action?.(full) ?? null;
  const close = () => store.dismiss(hint.id);
  return (
    <aside className={[h.hint, className].filter(Boolean).join(" ")} data-hint={hint.id} aria-label="Tip">
      <p className={h.text}>
        {hint.text}
        {action ? (
          <>
            {" "}
            {action.external ? (
              <a
                className={h.action}
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  close();
                  openLink(action.href);
                }}
              >
                {action.label}
              </a>
            ) : (
              <Link prefetch className={h.action} href={action.href} onClick={close}>
                {action.label}
              </Link>
            )}
          </>
        ) : null}
      </p>
      <button type="button" className={h.close} onClick={close} aria-label="Dismiss tip">
        ×
      </button>
    </aside>
  );
}

/** For a screen that dismisses a hint itself (the action done elsewhere, e.g. "Add to Google Calendar"). */
export function useDismissHint() {
  const store = useContext(Ctx);
  return store?.dismiss ?? (() => {});
}
