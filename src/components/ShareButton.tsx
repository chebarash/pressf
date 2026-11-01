"use client";

import { useState } from "react";
import { webApp } from "./TelegramApp";

/** In Telegram it opens the chat picker with the bot's inline search. Elsewhere it shares the link. */
export function ShareButton({ query, title }: { query: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const app = webApp();
    if (app?.switchInlineQuery) return app.switchInlineQuery(query, ["users", "groups", "channels"]);
    if (navigator.share) return navigator.share({ title, url: location.href }).catch(() => {});
    await navigator.clipboard.writeText(location.href);
    setCopied(true);
  };
  return <button className="key btn" onClick={share}>{copied ? "Link copied" : "Share"}</button>;
}
