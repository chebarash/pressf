"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { LinkTelegram } from "@/ui/shell/LinkTelegram";

/** Opens the D19 dialog straight away; closing it goes back to where the student came from. */
export function LinkTelegramPage() {
  const router = useRouter();
  const close = useCallback(() => (history.length > 1 ? router.back() : router.replace("/me")), [router]);
  return <LinkTelegram open onClose={close} />;
}
