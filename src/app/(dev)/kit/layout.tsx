import "@/ui/tokens.css";
import type { Metadata } from "next";
import { Geologica, Instrument_Serif } from "next/font/google";
import s from "./kit.module.css";

const serif = Instrument_Serif({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-serif" });
const sans = Geologica({ subsets: ["latin", "latin-ext"], variable: "--font-sans" });

export const metadata: Metadata = { title: "UI kit", robots: { index: false, follow: false } };

export default function KitLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${serif.variable} ${sans.variable} ${s.root}`}>{children}</div>;
}
