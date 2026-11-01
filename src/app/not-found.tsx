import { Palette } from "@/components/Palette";

export default function NotFound() {
  return (
    <div className="wrap section" style={{ justifyItems: "center", textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="face" src="/pfp.png" alt="" width={200} height={200} />
      <h1 className="d-lg">This page pressed F</h1>
      <p className="soft">It may have moved, or it never existed. Try searching.</p>
      <div style={{ width: "min(800px, 100%)", textAlign: "left" }}><Palette variant="bar" /></div>
    </div>
  );
}
