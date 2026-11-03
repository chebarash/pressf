"use client";

import { useEffect, useState } from "react";
import { Toast, ToastViewport } from "@/ui/components";
import b from "./base.module.css";

/** A toast that shows for 3 s, then clears its ?query flag so a reload does not repeat it. */
export function Notice({ text, tone = "default", param }: { text: string; tone?: "default" | "error"; param?: string }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    if (param) {
      const url = new URL(window.location.href);
      url.searchParams.delete(param);
      window.history.replaceState(window.history.state, "", url);
    }
    const t = setTimeout(() => setShown(false), 3000);
    return () => clearTimeout(t);
  }, [param]);
  return <ToastViewport className={b.notice}>{shown ? <Toast tone={tone}>{text}</Toast> : null}</ToastViewport>;
}
