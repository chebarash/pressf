import "@/ui/tokens.css";
import { Geologica, Instrument_Serif } from "next/font/google";

/**
 * Tokens and the two families for these screens. The app shell sets the same
 * variables on <html>; this keeps the screens right until and after it does.
 */
const serif = Instrument_Serif({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-serif" });
const sans = Geologica({ subsets: ["latin", "latin-ext"], variable: "--font-sans" });

export const fontVars = `${serif.variable} ${sans.variable}`;
