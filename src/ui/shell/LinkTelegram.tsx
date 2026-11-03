"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { startTelegramLink, telegramLinkUsed, unlinkTelegram } from "@/app/link/actions";
import { BOT_USERNAME } from "@/core/links";
import { Dialog, Toast } from "./overlays";
import { QrSvg } from "./QrSvg";

type Link = NonNullable<Awaited<ReturnType<typeof startTelegramLink>>>;

/**
 * D19 → D20. Issues a one-time code, shows it as a QR and a t.me link, and
 * polls until the phone opens it; then the sidebar invite goes away and a toast
 * says alerts now go to Telegram (with Undo).
 */
export function LinkTelegram({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [link, setLink] = useState<Link | null>(null);
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    startTelegramLink().then((l) => { if (!cancelled) setLink(l); });
    return () => { cancelled = true; setLink(null); };
  }, [open]);

  useEffect(() => {
    if (!open || !link) return;
    const timer = setInterval(async () => {
      if (await telegramLinkUsed(link.token)) {
        clearInterval(timer);
        setLinked(true);
        onClose();
        router.refresh();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [open, link, onClose, router]);

  const closeToast = useCallback(() => setLinked(false), []);

  return (
    <>
      {open && (
        <Dialog label="Continue in Telegram" onClose={onClose}>
          <div className="sh-link-qr">{link ? <QrSvg qr={link.qr} size={196} label="Scan to open Press F in Telegram" /> : <div className="sh-skel" style={{ width: 196, height: 196 }} />}</div>
          <div className="sh-link-text">
            <h2 className="sh-sheet__title">Continue in Telegram</h2>
            <ol className="sh-link-steps">
              <li><span>1</span>Point your phone camera at the code</li>
              <li><span>2</span>Tap Start — Press F opens already signed in as you</li>
              <li><span>3</span>No LMS password on the phone. This page updates by itself</li>
            </ol>
            <p className="sh-sheet__fine">Your session travels with the code: it&apos;s single-use, works 10 minutes and only for this account.</p>
            <div className="sh-link-actions">
              <a className="sh-btn" href={link?.url ?? `https://t.me/${BOT_USERNAME}`} target="_blank" rel="noopener" aria-disabled={!link}>Open Telegram here</a>
              <button type="button" className="sh-btn" onClick={onClose}>Close <kbd className="sh-kbd sh-kbd--key">Esc</kbd></button>
            </div>
          </div>
        </Dialog>
      )}
      {linked && (
        <Toast action="Undo" onAction={() => { void unlinkTelegram().then(() => router.refresh()); }} onClose={closeToast}>
          Signed in on Telegram too. Alerts now come to @{BOT_USERNAME}.
        </Toast>
      )}
    </>
  );
}
