"use client";

import { useRouter } from "next/navigation";
import { useMainButton, useSecondaryButton } from "@/platform/client";

/**
 * The screen's bottom actions (Figma TG/MainButton 4164:3243, TG/BottomButtons
 * 4172:5985) through the platform layer: Telegram's native buttons in the Mini
 * App, the shell's bar elsewhere. A sheet's buttons stack over the screen's.
 * Renders nothing itself.
 */

export type BottomAction = { text: string; href?: string; onClick?: () => void };

export function MainButton({ text, href, onClick, disabled, loading, shine, secondary }: BottomAction & { disabled?: boolean; loading?: boolean; shine?: boolean; secondary?: BottomAction | null }) {
  const router = useRouter();
  const go = (a: BottomAction) => () => (a.onClick ? a.onClick() : a.href ? router.push(a.href) : undefined);
  useMainButton({ text, onClick: go({ text, href, onClick }), disabled, loading, shine });
  useSecondaryButton(secondary ? { text: secondary.text, onClick: go(secondary), position: "left" } : null);
  return null;
}
