import Link from "next/link";

export default function NotFound() {
  return (
    <main className="sh-setup" style={{ maxWidth: 560, margin: "0 auto", paddingTop: "calc(var(--sh-top) + 48px)" }}>
      <h1 className="t-mobile-title">Nothing here</h1>
      <p className="sh-setup__text">That page moved or never existed.</p>
      <Link className="sh-btn sh-btn--primary" href="/" style={{ justifySelf: "start" }}>Go to Today</Link>
    </main>
  );
}
