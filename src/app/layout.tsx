import "@/ui/tokens.css";
import "@/ui/shell/shell.css";
import type { Metadata, Viewport } from "next";
import { Geologica, Instrument_Serif } from "next/font/google";
import { getUser } from "@/lib/auth";
import { appMetadata } from "@/server/og";
import { bootScript } from "@/platform/boot";
import { PlatformProvider } from "@/platform/PlatformProvider";
import { getPlatform, isMobile } from "@/platform/server";

// next/font defines --font-serif / --font-sans on <body>, overriding the
// fallback stacks tokens.css declares on :root.
const serif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin", "latin-ext"], variable: "--font-serif", display: "swap" });
const sans = Geologica({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });

// Share previews come from the OG helpers (src/server/og.ts); pages override with their own.
const app = appMetadata();
export const metadata: Metadata = {
  ...app,
  title: { default: "Press F", template: "%s · Press F" },
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Inputs at 16px keep iOS from zooming; the app is laid out for 1x.
  maximumScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [platform, user] = await Promise.all([getPlatform(), getUser()]);
  return (
    <html lang="en" className={platform === "telegram" ? "tg" : undefined} suppressHydrationWarning>
      <head>
        {/* Before first paint: Mini App detection, theme, Telegram SDK (only inside Telegram). */}
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className={`${serif.variable} ${sans.variable}`}>
        <PlatformProvider value={{ kind: platform, mobile: isMobile(platform), telegram: platform === "telegram", signedIn: !!user }}>
          {children}
        </PlatformProvider>
      </body>
    </html>
  );
}
