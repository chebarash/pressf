"use client";

import { signOut as endSession } from "next-auth/react";
import { forgetLms } from "@/app/(auth)/actions";
import { confirm, haptic } from "@/platform/native";

/**
 * 8.2 Sign out: Telegram's native confirm (the shell's dialog on the web), then
 * Press F forgets the LMS password, unlinks Telegram and clears the session.
 * Resolves true when signed out. Call from a click handler, then navigate home.
 */
export async function signOutWithConfirm(): Promise<boolean> {
  const ok = await confirm("Press F forgets your LMS password. Your ratings stay.", { title: "Sign out?", ok: "Sign out", cancel: "Cancel", destructive: true });
  if (!ok) return false;
  haptic.impact("medium");
  await forgetLms();
  await endSession({ redirect: false });
  return true;
}
