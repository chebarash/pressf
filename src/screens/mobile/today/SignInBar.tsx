"use client";

import { useRouter } from "next/navigation";
import { BottomBar } from "../parts/BottomBar";

export function SignInBar() {
  const router = useRouter();
  return <BottomBar main={{ text: "Sign in with LMS", onClick: () => router.push("/sign-in") }} />;
}
