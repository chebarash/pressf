"use client";

import { BottomButtons, MainButton } from "@/ui/components";
import s from "../mobile.module.css";
import { useBottomButton } from "./telegram";

type Button = { text: string; onClick: () => void; shine?: boolean; busy?: boolean };

/**
 * Telegram's bottom bar: the native MainButton (and SecondaryButton) inside
 * the Mini App, the kit's web fallback in a browser. `inline` keeps it in
 * flow (a sheet footer) instead of sticking to the bottom of the screen.
 */
export function BottomBar({ main, secondary, visible = true, inline }: { main: Button; secondary?: Button; visible?: boolean; inline?: boolean }) {
  const inside = useBottomButton("main", { ...main, visible });
  useBottomButton("secondary", { text: secondary?.text ?? "", onClick: secondary?.onClick ?? (() => {}), visible: visible && !!secondary });
  if (inside || !visible) return null;
  const cls = inline ? undefined : s.barBleed;
  const state = main.busy ? "loading" : main.shine ? "shine" : "default";
  if (secondary)
    return <BottomButtons sticky={!inline} className={cls} main={{ label: main.text, onClick: main.onClick, state: main.busy ? "loading" : "default" }} secondary={{ label: secondary.text, onClick: secondary.onClick }} />;
  return <MainButton sticky={!inline} className={cls} label={main.text} state={state} onClick={main.onClick} />;
}
