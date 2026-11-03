"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="sh-setup" style={{ maxWidth: 560, margin: "0 auto", paddingTop: "calc(var(--sh-top) + 48px)" }}>
      <h1 className="t-mobile-title">Something broke</h1>
      <p className="sh-setup__text">It&apos;s on our side. Try again; your data is safe.</p>
      <button type="button" className="sh-btn sh-btn--primary" onClick={reset} style={{ justifySelf: "start" }}>Try again</button>
    </main>
  );
}
