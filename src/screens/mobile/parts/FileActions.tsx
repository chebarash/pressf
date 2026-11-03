"use client";

import type { Target } from "@/core/links";
import { downloadFile, shareTarget } from "@/platform/client";
import { SendIcon } from "@/ui/icons";
import { MainButton } from "./MainButton";
import s from "./File.module.css";

/** Download: Telegram's native download sheet in the Mini App, a plain download on the web. */
export function FileActions({ url, name }: { url: string; name: string }) {
  return <MainButton text="Download" onClick={() => downloadFile(url, name)} />;
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
