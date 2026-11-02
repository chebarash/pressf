"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Signs in through the university LMS. Works everywhere, the mini app included,
 * so there is no external-browser hop. With a Telegram initData (`telegram`) it
 * links the account to that Telegram after a successful sign-in.
 */
export function LmsSignIn({ telegram }: { telegram?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(false);
    const result = await signIn("lms", { email, password, redirect: false });
    if (result?.ok) {
      router.push(telegram ? `/telegram-linked?tg=${encodeURIComponent(telegram)}` : "/");
      router.refresh();
      return;
    }
    setError(true);
    setBusy(false);
  };

  return (
    <form className="signin" onSubmit={submit} style={{ display: "grid", gap: 12, width: "100%", maxWidth: 320 }}>
      <input
        className="input" type="email" inputMode="email" autoComplete="username"
        placeholder="LMS email" value={email} required
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="input" type="password" autoComplete="current-password"
        placeholder="LMS password" value={password} required
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="small" style={{ color: "#e5484d" }}>Wrong email or password, or the LMS is down.</p>}
      <button className="key btn primary" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
