"use client";

import { signIn } from "next-auth/react";
import { webApp } from "./TelegramApp";

export function GoogleSignIn({ label, telegram }: { label: string; telegram?: string }) {
  const start = () => {
    const app = webApp();
    if (app?.initData) return app.openLink(`${location.origin}/sign-in?tg=${encodeURIComponent(app.initData)}`);
    signIn("google", { callbackUrl: telegram ? `/telegram-linked?tg=${encodeURIComponent(telegram)}` : "/" });
  };
  return <button className="key btn" onClick={start}>{label}</button>;
}
