"use client";

import { useMainButton, useSecondaryButton } from "@/platform/client";

type Button = { text: string; onClick: () => void; shine?: boolean; busy?: boolean };

/**
 * The screen's bottom actions through the shell: Telegram's MainButton /
 * SecondaryButton in the Mini App, the shell's bar elsewhere. Buttons stack,
 * so a sheet's action replaces the screen's until the sheet closes.
 */
export function BottomBar({ main, secondary, visible = true }: { main: Button; secondary?: Button; visible?: boolean }) {
  useMainButton(visible && { text: main.text, onClick: main.onClick, loading: main.busy, shine: main.shine });
  useSecondaryButton(visible && !!secondary && { text: secondary.text, onClick: secondary.onClick, position: "left" });
  return null;
}
