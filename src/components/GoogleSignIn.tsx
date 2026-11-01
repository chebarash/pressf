"use client";

import { signIn } from "next-auth/react";

export const GoogleSignIn = ({ label }: { label: string }) => (
  <button className="key btn" onClick={() => signIn("google", { callbackUrl: "/" })}>{label}</button>
);
