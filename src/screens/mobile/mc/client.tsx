"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { MainButton as KitMainButton, Sheet as KitSheet } from "@/ui/components";

/**
 * The screen's one primary action (Figma TG/MainButton): the kit's sticky
 * web button. The shell swaps it for Telegram's native one.
 */
export function MainButton({ text, href, onClick, disabled, inline }: { text: string; href?: string; onClick?: () => void; disabled?: boolean; inline?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (href) router.prefetch(href);
  }, [href, router]);
  return <KitMainButton sticky={!inline} label={text} state={disabled ? "disabled" : "default"} onClick={() => (href ? router.push(href) : onClick?.())} />;
}

/** The kit's bottom sheet, open while this screen state is in the URL; closing goes to `closeHref`. */
export function Sheet({ closeHref, title, heading = true, children, className, footer }: { closeHref: string; title: string; heading?: boolean; children: ReactNode; className?: string; footer?: ReactNode }) {
  const router = useRouter();
  return (
    <KitSheet open onClose={() => router.replace(closeHref, { scroll: false })} title={title} heading={heading} className={className} footer={footer}>
      {children}
    </KitSheet>
  );
}

/**
 * Native confirm in Telegram (showPopup with a destructive button, 8.2/8.7),
 * the browser's confirm elsewhere.
 */
export function confirmAction(message: string, opts: { title?: string; ok: string; destructive?: boolean }): Promise<boolean> {
  type Popup = (p: { title?: string; message: string; buttons: Array<{ id: string; type: string; text?: string }> }, cb: (id: string) => void) => void;
  const tg = (globalThis as { Telegram?: { WebApp?: { showPopup?: Popup; isVersionAtLeast?: (v: string) => boolean } } }).Telegram?.WebApp;
  if (tg?.showPopup && tg.isVersionAtLeast?.("6.2")) {
    return new Promise((resolve) =>
      tg.showPopup!(
        { title: opts.title, message, buttons: [{ id: "cancel", type: "cancel" }, { id: "ok", type: opts.destructive ? "destructive" : "default", text: opts.ok }] },
        (id) => resolve(id === "ok"),
      ),
    );
  }
  return Promise.resolve(window.confirm(opts.title ? `${opts.title}\n\n${message}` : message));
}
