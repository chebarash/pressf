import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import type { Metadata } from "next";
import { Geologica, Instrument_Serif } from "next/font/google";
import Script from "next/script";
import { cookies } from "next/headers";
import { Footer, Nav, StaleNotice } from "@/components/Chrome";
import { TabBar } from "@/components/TabBar";
import { TelegramApp } from "@/components/TelegramApp";
import { getUser } from "@/lib/auth";

const serif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin", "latin-ext"], variable: "--serif" });
const sans = Geologica({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--sans" });

export const metadata: Metadata = {
  metadataBase: new URL("https://pressf.chebarash.uz"),
  title: { default: "Press F", template: "%s · Press F" },
  description: "Courses, teachers, files and timetables for New Uzbekistan University students.",
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  manifest: "/site.webmanifest",
};

const themeScript = `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t;else if(matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.dataset.theme="dark"}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const group = user?.group ?? (await cookies()).get("group")?.value ?? null;
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${serif.variable} ${sans.variable}`} suppressHydrationWarning>
      <body>
        <Script id="theme" strategy="beforeInteractive">{themeScript}</Script>
        <Nav user={user} group={group} />
        <StaleNotice />
        <main>{children}</main>
        <Footer />
        <TabBar />
        <TelegramApp signedIn={!!user} />
      </body>
    </html>
  );
}
