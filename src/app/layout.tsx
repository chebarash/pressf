import type { Metadata } from "next";
import { Geologica, Six_Caps } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/SessionProvider";
import { getServerSession } from "next-auth";
import { connectToDatabase } from "@/lib/db";
import Footer from "@/components/Footer";
import { authOptions } from "./api/auth/[...nextauth]/authOptions";

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
      <body className={`${sixCaps.variable} ${geologica.variable}`}>
        <AuthProvider session={session}>{children}</AuthProvider>
        <Footer />
      </body>
    </html>
  );
}
