import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap section" style={{ justifyItems: "center", textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="face" src="/pfp.png" alt="" width={200} height={200} />
      <h1 className="d-lg">This page pressed F</h1>
      <p className="soft">It may have moved, or it never existed.</p>
      <Link className="key btn" href="/">Back to home</Link>
    </div>
  );
}
