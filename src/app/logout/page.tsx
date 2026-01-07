"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    const logout = async () => {
      await signOut({ redirect: false });
      router.push("/");
    };

    logout();
  }, [router]);

  return (
    <main>
      <h1>Logging out...</h1>
    </main>
  );
}
