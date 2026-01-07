// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import "./globals.css";
import type { Metadata } from "next";
import { Geologica, Six_Caps } from "next/font/google";
import AuthProvider from "@/components/SessionProvider";
import { getServerSession } from "next-auth";
import { connectToDatabase } from "@/lib/db";
import Footer from "@/components/Footer";
import { authOptions } from "./api/auth/[...nextauth]/authOptions";
import { Analytics } from "@vercel/analytics/next";
import Head from "next/head";

const sixCaps = Six_Caps({
  weight: "400",
  variable: "--six-caps",
  subsets: ["latin-ext"],
});
const geologica = Geologica({
  weight: "variable",
  variable: "--geologica",
  subsets: ["latin-ext"],
});

export const metadata: Metadata = {
  title: "Press F",
  description: "Not all heroes wear capes… Some just teach really well.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  connectToDatabase();
  const session = await getServerSession(authOptions);
  return (
    <html lang="en">
      <Analytics />
      <Head>
        <link
          rel="icon"
          type="image/png"
          href="/favicon-96x96.png"
          sizes="96x96"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link rel="manifest" href="/site.webmanifest" />
      </Head>
      <body className={`${sixCaps.variable} ${geologica.variable}`}>
        <AuthProvider session={session}>{children}</AuthProvider>
        <Footer />
      </body>
    </html>
  );
}
