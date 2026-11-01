"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="wrap section" style={{ justifyItems: "center", textAlign: "center" }}>
      <h1 className="d-lg">Something broke</h1>
      <p className="soft">Try again in a moment.</p>
      <button className="key btn" onClick={reset}>Try again</button>
    </div>
  );
}
