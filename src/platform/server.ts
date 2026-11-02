import { cookies, headers } from "next/headers";

/**
 * Which front end to render. The Telegram bridge sets the `pf_platform=telegram`
 * cookie on first load inside the Mini App; otherwise the user agent decides.
 */
export type Platform = "telegram" | "mobile-web" | "desktop";

export async function getPlatform(): Promise<Platform> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  if (c.get("pf_platform")?.value === "telegram") return "telegram";
  const ua = h.get("user-agent") ?? "";
  return /Mobi|Android|iPhone|iPod/i.test(ua) ? "mobile-web" : "desktop";
}

export const isMobile = (p: Platform) => p !== "desktop";
