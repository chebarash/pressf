"use client";

import { useEffect, useState } from "react";
import { Toast, ToastViewport } from "@/ui/components";

export type Note = { text: string; error?: boolean } | string | null;

/** Kit toast for admin action outcomes; hides itself after 3.5 s. */
export function AdminToast({ note }: { note: Note }) {
  const [shown, setShown] = useState<Note>(null);
  const [last, setLast] = useState<Note>(null);
  if (note !== last) {
    setLast(note);
    setShown(note);
  }
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 3500);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  const n = typeof shown === "string" ? { text: shown } : shown;
  return (
    <ToastViewport>
      <Toast tone={n.error ? "error" : "default"}>{n.text}</Toast>
    </ToastViewport>
  );
}
