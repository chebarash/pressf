"use client";

import { useEffect, useState } from "react";
import { webApp } from "./TelegramApp";

/** Offers the Telegram home screen shortcut where the device supports it and it is not added yet. */
export function HomeScreenButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const check = () => {
      const app = webApp();
      if (app?.isVersionAtLeast("8.0")) app.checkHomeScreenStatus?.((status) => setShow(status === "missed"));
    };
    check();
    document.addEventListener("tg-ready", check);
    return () => document.removeEventListener("tg-ready", check);
  }, []);
  if (!show) return null;
  return <button className="key btn sm" onClick={() => { webApp()?.addToHomeScreen?.(); setShow(false); }}>Add to home screen</button>;
}
