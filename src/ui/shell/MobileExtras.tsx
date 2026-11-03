"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePlatform, useTelegramReady } from "@/platform/hooks";
import { addToHomeScreen, cloudStorage, homeScreenStatus } from "@/platform/native";
import { HomeScreenSheet } from "./prompts";
import { Dialog, Sheet, Toast } from "./overlays";
import { SignInForm } from "./SignInForm";

const WEEK = 7 * 24 * 3600_000;

/**
 * Things the frame shows over any screen: "sign in again" when the LMS
 * password changed (8.3), the hand-off toast (1.11) and, in Telegram, the
 * one-time home screen offer after the first week (1.9).
 */
export function MobileExtras({ signedIn, needsReauth, email, desktop }: { signedIn: boolean; needsReauth: boolean; email?: string; desktop?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { telegram } = usePlatform();
  const ready = useTelegramReady();
  const [dismissed, setDismissed] = useState(false);
  const reauth = needsReauth && !dismissed;
  const [toast, setToast] = useState<string | null>(null);
  const [offer, setOffer] = useState(false);

  // 1.11: arriving from the desktop hand-off (/link/… redirects with ?from=desktop).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("from") !== "desktop") return;
    const name = params.get("as") ?? "you";
    setTimeout(() => setToast(name), 0);
    params.delete("from");
    params.delete("as");
    const rest = params.toString();
    router.replace(`${pathname}${rest ? `?${rest}` : ""}`, { scroll: false });
  }, [pathname, router]);

  // 1.9: offered once, a week after the first launch, if Telegram can add it.
  useEffect(() => {
    if (!telegram || !ready || !signedIn) return;
    let cancelled = false;
    (async () => {
      const first = await cloudStorage.get("first_seen");
      if (!first) return cloudStorage.set("first_seen", String(Date.now()));
      if (Date.now() - Number(first) < WEEK || (await cloudStorage.get("home_offered"))) return;
      if ((await homeScreenStatus()) !== "missed" || cancelled) return;
      await cloudStorage.set("home_offered", "1");
      setOffer(true);
    })();
    return () => { cancelled = true; };
  }, [telegram, ready, signedIn]);

  const closeToast = useCallback(() => setToast(null), []);
  const closeReauth = useCallback(() => setDismissed(true), []);

  return (
    <>
      {reauth && (desktop ? (
        <Dialog label="Sign in again" onClose={closeReauth}>
          <div style={{ width: "100%" }}><SignInForm mode="again" desktop email={email} next={pathname} onGuest={closeReauth} /></div>
        </Dialog>
      ) : (
        <Sheet label="Sign in again" onClose={closeReauth}>
          <SignInForm mode="again" email={email} next={pathname} onGuest={closeReauth} />
        </Sheet>
      ))}
      {offer && !reauth && <HomeScreenSheet onAdd={() => { addToHomeScreen(); setOffer(false); }} onClose={() => setOffer(false)} />}
      {toast && (
        <Toast onClose={closeToast} ms={8000}>
          Signed in from your computer as {toast}. Not you? Sign out in Profile.
        </Toast>
      )}
    </>
  );
}
