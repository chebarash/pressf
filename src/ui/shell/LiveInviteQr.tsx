"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { startTelegramLink } from "@/app/link/actions";
import { QrSvg } from "./QrSvg";
import type { QrData } from "./qr";

/** Codes live 10 minutes; renew a little earlier so the one on screen always works. */
const RENEW_MS = 8 * 60_000;

/**
 * The sidebar invite's QR is a real one-time sign-in code (not a plain link to
 * the app), so scanning it opens Press F in Telegram already signed in. It renews
 * itself, and the page refreshes when the window regains focus so the invite
 * goes away once Telegram is linked.
 */
export function LiveInviteQr({ fallback, size }: { fallback: QrData; size: number }) {
  const router = useRouter();
  const [qr, setQr] = useState<QrData | null>(null);

  useEffect(() => {
    let alive = true;
    const renew = () => startTelegramLink().then((l) => { if (alive && l) setQr(l.qr); }).catch(() => {});
    void renew();
    const timer = setInterval(renew, RENEW_MS);
    const onFocus = () => { void renew(); router.refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [router]);

  return <QrSvg qr={qr ?? fallback} size={size} label="Scan to open Press F in Telegram, signed in" />;
}
