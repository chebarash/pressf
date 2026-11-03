"use client";

import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = { "/": "Today", "/notifications": "Notifications", "/qr": "Scan QR" };

/** The title of the screen that is loading, so the skeleton reads like the screen (Figma 1.1). */
export function LoadingTitle() {
  return TITLES[usePathname() ?? "/"] ?? "Loading";
}
