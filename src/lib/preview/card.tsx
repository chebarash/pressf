import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { tierOf } from "@/lib/criteria";

export const OG_SIZE = { width: 1200, height: 630 };

const INK = "#12110C";
const PAPER = "#F5F0D6";
const TIER = { High: ["#2A7181", "#FFFFFF"], Mid: ["#D9A21B", INK], Low: ["#B8452B", "#FFFFFF"], None: ["#ECE5C3", "#5A5648"] };

// The sans face is a variable font, which image rendering cannot read.
const fonts = async () => [{ name: "Serif", data: await readFile(join(process.cwd(), "src/lib/telegram/fonts/InstrumentSerif-Regular.ttf")), weight: 400 as const }];

export function ScoreTile({ value, size }: { value?: number | null; size: number }) {
  const [background, color] = TIER[tierOf(value)];
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, background, color, border: `${Math.max(3, size / 45)}px solid ${INK}`, borderRadius: size * .22, boxShadow: `0 ${size / 18}px 0 ${INK}`, fontFamily: "Serif", fontSize: size * .66 }}>
      {value == null ? "–" : value.toFixed(1)}
    </div>
  );
}

const titleSize = (title: string) => (title.length > 44 ? 72 : title.length > 24 ? 92 : 124);

/** The card every shared link shows: what it is, on paper, with the Press F key. */
export async function previewCard({ eyebrow, title, lines, side }: { eyebrow: string; title: string; lines: string[]; side?: ReactNode }) {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", padding: 64, background: PAPER, color: INK, fontFamily: "Serif" }}>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, flexBasis: 0, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: "Serif", fontSize: 44 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 60, height: 60, background: "#FFFFFF", border: `4px solid ${INK}`, borderRadius: 14, boxShadow: `0 6px 0 ${INK}` }}>F</div>
          Press F
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", fontSize: 36, color: "#2A7181" }}>{eyebrow}</div>
          <div style={{ display: "flex", fontFamily: "Serif", fontSize: titleSize(title), lineHeight: 1.02 }}>{title}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 36, color: "#5A5648" }}>{lines.map((line) => <div key={line} style={{ display: "flex" }}>{line}</div>)}</div>
        </div>
      </div>
      {side && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 400, marginLeft: 40 }}>{side}</div>}
    </div>,
    { ...OG_SIZE, fonts: await fonts() },
  );
}

/** A small square for the bot's inline list. */
export async function thumbnail(children: ReactNode) {
  return new ImageResponse(<div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: PAPER }}>{children}</div>, { width: 160, height: 160, fonts: await fonts() });
}

export async function imageData(url: string) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
}

export const defaultFace = async () => `data:image/png;base64,${(await readFile(join(process.cwd(), "public/pfp.png"))).toString("base64")}`;
