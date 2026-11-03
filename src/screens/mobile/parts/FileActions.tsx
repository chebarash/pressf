"use client";

import { startParam, webUrl, type Target } from "@/core/links";
import { downloadFile, shareInline } from "@/platform/client";
import { SendIcon } from "@/ui/icons";
import { MainButton } from "./MainButton";
import s from "./File.module.css";

/** Download: Telegram's native download sheet in the Mini App, a plain download on the web. */
export function FileActions({ url, name }: { url: string; name: string }) {
  return <MainButton text="Download" onClick={() => downloadFile(url, name)} />;
}

/**
 * Share in Telegram through the bot's inline mode ("@pressfapp c_MATH111"): the
 * chat gets the rich card and the share is counted. Outside Telegram, a t.me/share link to the page.
 */
export function ShareButton({ target, title, text, className }: { target: Target; title: string; text?: string; className?: string }) {
  return (
    <button type="button" className={className ?? s.share} aria-label={`Share ${title}`} onClick={() => shareInline(startParam(target), webUrl(target), text)}>
      <SendIcon size={20} />
    </button>
  );
}
