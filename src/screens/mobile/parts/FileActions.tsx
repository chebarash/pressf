"use client";

import type { Target } from "@/core/links";
import { useState } from "react";
import { downloadToChat, shareTarget } from "@/platform/client";
import { SendIcon } from "@/ui/icons";
import { MainButton } from "./MainButton";
import s from "./File.module.css";

/**
 * Download: in the Mini App the bot sends the file into the student's chat
 * (progress on the MainButton while it sends), falling back to Telegram's
 * download sheet; a plain download on the web. See downloadToChat.
 */
export function FileActions({ id, url, name }: { id: string; url: string; name: string }) {
  const [sending, setSending] = useState(false);
  const download = () => {
    setSending(true);
    const done = () => setSending(false);
    void downloadToChat(id, url, name, done).finally(done);
  };
  return <MainButton text="Download" loading={sending} onClick={download} />;
}

/**
 * Share in Telegram as the bot's rich card (a prepared message on Bot API 8.0+,
 * inline mode before that); the share is counted. Outside Telegram, the system
 * share sheet or a copied link. See shareTarget.
 */
export function ShareButton({ target, title, text, className }: { target: Target; title: string; text?: string; className?: string }) {
  return (
    <button type="button" className={className ?? s.share} aria-label={`Share ${title}`} onClick={() => void shareTarget(target, text)}>
      <SendIcon size={20} />
    </button>
  );
}
