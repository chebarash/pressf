"use client";

import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { useMainButton } from "@/platform/hooks";
import { Sheet } from "./overlays";
import { SignInForm } from "./SignInForm";

/**
 * Guest mobile screens: "Sign in with LMS" as the MainButton (1.2), opening the
 * sign-in sheet over the current screen (1.3). Pass `open` to start open
 * (the /sign-in route).
 */
export function GuestSignIn({ open: initiallyOpen = false, next }: { open?: boolean; next?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(initiallyOpen);
  const close = useCallback(() => setOpen(false), []);
  useMainButton(!open && { text: "Sign in with LMS", onClick: () => setOpen(true) });
  if (!open) return null;
  return (
    <Sheet label="Sign in with LMS" onClose={close}>
      <SignInForm next={next ?? pathname} onGuest={close} />
    </Sheet>
  );
}
