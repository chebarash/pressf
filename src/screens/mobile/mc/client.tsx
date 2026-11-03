"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useMainButton, usePlatform } from "@/platform/client";
import { MainButton as KitMainButton, Sheet as KitSheet } from "@/ui/components";

/**
 * The screen's one primary action (Figma TG/MainButton) through the platform
 * bridge: Telegram's native button in the Mini App, the shell's bottom button on
 * the web. `inline` draws it in place on the web (inside a modal sheet, where
 * the page's bottom bar sits under the scrim).
 */
export function MainButton({ text, href, onClick, disabled, inline }: { text: string; href?: string; onClick?: () => void; disabled?: boolean; inline?: boolean }) {
  const router = useRouter();
  const { telegram } = usePlatform();
  const go = () => (href ? router.push(href) : onClick?.());
  const drawn = inline && !telegram;
  useMainButton(drawn ? null : { text, disabled, onClick: go });
  useEffect(() => {
    if (href) router.prefetch(href);
  }, [href, router]);
  return drawn ? <KitMainButton label={text} state={disabled ? "disabled" : "default"} onClick={go} /> : null;
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
