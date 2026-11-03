"use client";

import { useCallback, useState } from "react";
import { DesktopGlobal, openPalette, openShortcuts } from "@/screens/desktop/global";
import { LinkTelegram } from "./LinkTelegram";
import { Sidebar, type SidebarProps } from "./Sidebar";

/**
 * The desktop sidebar plus the global layer: keyboard (G-chords, J/K, page keys),
 * the ⌘K / F command palette (D2), the ? shortcuts sheet (D11) and the Telegram hand-off.
 */
export function DesktopChrome(props: Omit<SidebarProps, "onSearch" | "onShortcuts" | "onLinkTelegram">) {
  const [link, setLink] = useState(false);
  const close = useCallback(() => setLink(false), []);
  return (
    <>
      <Sidebar {...props} onSearch={() => openPalette()} onShortcuts={openShortcuts} onLinkTelegram={() => setLink(true)} />
      <DesktopGlobal />
      <LinkTelegram open={link} onClose={close} />
    </>
  );
}
