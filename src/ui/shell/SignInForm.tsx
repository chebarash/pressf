"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { hasSnapshot } from "@/app/(auth)/actions";
import type { SignInError } from "@/lib/auth";
import { useMainButton } from "@/platform/hooks";
import { haptic } from "@/platform/native";
import { webApp } from "@/platform/telegram";
import { Icon } from "./icons";

const MESSAGES: Record<SignInError, string> = {
  "wrong-password": "Wrong email or password. Use the ones from hero.study.",
  "lms-down": "hero.study is not answering right now. Your details are fine — try again in a minute.",
  "not-student": "This LMS account isn't a student account. Press F works with student logins only — staff can browse as guests.",
};

const asError = (code?: string | null): SignInError =>
  code === "lms-down" || code === "not-student" ? code : "wrong-password";

export type SignInMode = "first" | "again";

/**
 * LMS email + password (1.3–1.6, 1.10, 8.3, D10). On mobile the submit is the
 * MainButton; on desktop a keycap button. After a first sign-in the student
 * goes through the first sync (1.7), later straight back to `next`.
 */
export function SignInForm({ mode = "first", desktop, next = "/", email: initialEmail = "", onGuest }: { mode?: SignInMode; desktop?: boolean; next?: string; email?: string; onGuest?: () => void }) {
  const router = useRouter();
  const id = useId();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SignInError | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const guest = () => (onGuest ? onGuest() : router.push("/"));

  const submit = async () => {
    if (busy) return;
    if (error === "not-student") return guest();
    if (!email.trim() || !password) {
      (email.trim() ? passwordRef.current : document.getElementById(`${id}-email`))?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await signIn("lms", { email: email.trim(), password, initData: webApp()?.initData ?? "", redirect: false }).catch(() => null);
    if (result?.ok && !result.error) {
      haptic.notify("success");
      const ready = await hasSnapshot().catch(() => false);
      router.replace(ready ? next : `/setup?next=${encodeURIComponent(next)}`);
      router.refresh();
      return;
    }
    haptic.notify("error");
    setError(result ? asError(result.error) : "lms-down");
    setBusy(false);
  };

  const label = error === "lms-down" ? "Try again" : error === "not-student" ? "Browse as a guest" : "Sign in";
  useMainButton(desktop ? null : { text: label, onClick: () => void submit(), loading: busy });

  const fieldError = error && error !== "not-student" ? error : null;
  return (
    <form
      className={desktop ? "sh-signin sh-signin--card" : "sh-signin"}
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      aria-busy={busy}
      noValidate
    >
      <h2 className="sh-sheet__title">{mode === "again" ? "Sign in again" : "Sign in with LMS"}</h2>
      <p className="sh-sheet__text">
        {mode === "again"
          ? "Your LMS password changed, so we can't sync. Enter the new one — your grades and files pick up where they stopped."
          : desktop
            ? "Your hero.study email and password. Stored encrypted only to sync your timetable, grades and files."
            : "Your hero.study email and password. Press F keeps them encrypted to sync your timetable, grades and files. Nobody sees who rated."}
      </p>
      <div className="sh-field" data-disabled={busy || undefined}>
        <label htmlFor={`${id}-email`}>Email</label>
        <input
          id={`${id}-email`} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
          placeholder="s.student@newuu.uz" value={email} disabled={busy}
          aria-invalid={fieldError === "wrong-password" || undefined}
          onChange={(e) => { setEmail(e.target.value); if (error === "not-student") setError(null); }}
        />
      </div>
      <div className="sh-field" data-disabled={busy || undefined}>
        <label htmlFor={`${id}-password`}>Password</label>
        <input
          id={`${id}-password`} ref={passwordRef} type="password" autoComplete="current-password"
          value={password} disabled={busy}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="sh-field__error" id={`${id}-error`} role="alert">{MESSAGES[error]}</p>}
      </div>
      {desktop ? (
        <>
          <div className="sh-signin__actions">
            <button type={error === "not-student" ? "button" : "submit"} className="sh-btn sh-btn--primary sh-btn--lg" disabled={busy} onClick={error === "not-student" ? guest : undefined}>
              {busy ? <span className="sh-spinner" aria-label="Signing in" /> : label}
            </button>
          </div>
          <p className="sh-signin__guest">or <Link href="/" className="sh-link">browse courses as a guest <Icon name="arrow-right" size={12} /></Link></p>
          <p className="sh-sheet__fine">Wrong password shows under the field; if hero.study is down we say so and keep what you typed.</p>
        </>
      ) : (
        // Enter in the password field submits; the visible button is Telegram's.
        <button type="submit" className="sh-sr" tabIndex={-1}>{label}</button>
      )}
    </form>
  );
}
