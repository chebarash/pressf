"use client";

import { downloadFile, openTelegramLink } from "@/platform/client";
import { SendIcon } from "@/ui/icons";
import { MainButton } from "./MainButton";
import s from "./File.module.css";

/** Download: Telegram's native download sheet in the Mini App, a plain download on the web. */
export function FileActions({ url, name }: { url: string; name: string }) {
  return <MainButton text="Download" onClick={() => downloadFile(url, name)} />;
}

export function ShareFile({ url, title }: { url: string; title: string }) {
  return (
    <button type="button" className={s.share} aria-label={`Share ${title}`} onClick={() => openTelegramLink(url)}>
      <SendIcon size={20} />
    </button>
  );
}
