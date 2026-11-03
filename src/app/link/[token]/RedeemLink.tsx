"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BOT_USERNAME, miniAppUrl } from "@/core/links";
import { useMainButton } from "@/platform/hooks";
import { haptic } from "@/platform/native";
import { whenWebApp } from "@/platform/telegram";
import { SkeletonPage } from "@/ui/shell/PageHeader";
import { signedInName } from "../actions";

type State = "working" | "expired" | "unverified" | "browser";

export function RedeemLink({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("working");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const app = await whenWebApp();
      if (!app?.initData) return setState("browser");
      const result = await signIn("link", { token, initData: app.initData, redirect: false }).catch(() => null);
      if (!result?.ok || result.error) {
        haptic.notify("error");
        return setState(result?.error === "telegram-unverified" ? "unverified" : "expired");
      }
      haptic.notify("success");
      const name = await signedInName().catch(() => null);
      router.replace(`/?from=desktop${name ? `&as=${encodeURIComponent(name)}` : ""}`);
      router.refresh();
    })();
  }, [router, token]);

  useMainButton((state === "expired" || state === "unverified") && { text: "Sign in with LMS", onClick: () => router.replace("/sign-in") });

  if (state === "working") return <SkeletonPage title="Today" />;
  return (
    <div className="sh-setup">
      <h1 className="t-mobile-title">{state === "expired" ? "That code expired" : state === "unverified" ? "Couldn't confirm Telegram" : "Open it in Telegram"}</h1>
      <p className="sh-setup__text">
        {state === "expired"
          ? "Codes work once and for 10 minutes. Show a new one on your computer, or sign in here with your LMS email."
          : state === "unverified"
            ? `Open the code from @${BOT_USERNAME} so Telegram can confirm it's you. Your code is still valid.`
            : "This link signs you in inside the Press F Mini App. Scan the code with your phone, or open it in Telegram."}
      </p>
      {state === "browser" && <a className="sh-btn sh-btn--primary" href={miniAppUrl({ to: "link", token })}>Open Telegram</a>}
    </div>
  );
}
