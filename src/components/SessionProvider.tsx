"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  session: any;
}

export default function AuthProvider({ children, session }: Props) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
