"use client";

import { useCallback, useEffect, useState } from "react";
import { Toast, ToastViewport } from "@/ui/components";
import { haptic } from "./telegram";

type Shown = { text: string; tone: "default" | "error"; key: number };

/** One toast at a time, 3 s, with haptic (Figma 9.4 Toasts). */
export function useToast() {
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 3000);
    return () => clearTimeout(t);
  }, [shown]);
  const show = useCallback((text: string, tone: Shown["tone"] = "default") => {
    haptic(tone === "error" ? "error" : "success");
    setShown({ text, tone, key: Date.now() });
  }, []);
  const view = <ToastViewport>{shown ? <Toast key={shown.key} tone={shown.tone}>{shown.text}</Toast> : null}</ToastViewport>;
  return [view, show] as const;
}
