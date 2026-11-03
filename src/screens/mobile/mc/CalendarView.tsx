"use client";

import { useEffect, useState } from "react";
import { Button, Toast, ToastViewport } from "./kit";
import c from "./screens.module.css";

/** "Add to my phone calendar" (6.1) and the confirmation toast (6.3). */
export function Subscribe({ href }: { href: string }) {
  const [toast, setToast] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <>
      <Button
        variant="secondary"
        label="Add to my phone calendar"
        icon
        className={c.subscribe}
        onClick={() => {
          // webcal:// hands the feed to the phone's calendar app as a subscription.
          const url = new URL(href, window.location.href);
          window.location.href = `webcal://${url.host}${url.pathname}`;
          setToast(true);
        }}
      />
      {toast ? (
        <ToastViewport>
          <Toast>Subscribed. Exams, deadlines and holidays now show in your phone&apos;s calendar and stay in sync.</Toast>
        </ToastViewport>
      ) : null}
    </>
  );
}
