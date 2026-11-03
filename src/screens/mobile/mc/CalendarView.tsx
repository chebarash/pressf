"use client";

import { useEffect, useState } from "react";
import { openLink } from "@/platform/client";
import { subscribeHint } from "./format";
import { Button, Toast, ToastViewport } from "./kit";
import c from "./screens.module.css";

/** "Add to Google Calendar" (6.1) and the toast after it (6.3). Google's add-by-URL page opens via Telegram's openLink. */
export function Subscribe({ google, personal, subscribed = false }: { google: string; personal: boolean; subscribed?: boolean }) {
  const [toast, setToast] = useState(subscribed);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(false), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <>
      <Button
        variant="secondary"
        label="Add to Google Calendar"
        icon
        className={c.subscribe}
        onClick={() => {
          openLink(google);
          setToast(true);
        }}
      />
      <p className={c.subscribeHint}>{subscribeHint(personal)}</p>
      {toast ? (
        <ToastViewport className={c.subViewport}>
          <Toast className={c.subToast}>Confirm in Google Calendar. It stays in sync, though Google refreshes it only a few times a day.</Toast>
        </ToastViewport>
      ) : null}
    </>
  );
}
