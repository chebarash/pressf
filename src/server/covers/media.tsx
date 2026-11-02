import { ImageResponse } from "next/og";
import { C, mascotDataUrl, ogFonts } from "./assets";
import { titleLines } from "./text";

/**
 * Cards for recordings. We do not re-encode media on the server, so these are
 * PNGs the bot can use: Cover/Video intro (also the poster frame) and
 * Cover/Audio art 1:1 (embedded cover art / Telegram thumbnail).
 */

export type MediaCard = {
  /** "Recording: Limits, lecture 3", "Office hours Q&A". */
  title: string;
  /** "Calculus 1 · Week 2 · Gonçalo Pinto · 1 h 24 min". */
  line: string;
};

const serif = { fontFamily: "Instrument Serif", fontWeight: 400 } as const;

/** Cover/Video intro, 1280×720 (pass `width` to scale). */
export async function videoIntroPng(card: MediaCard, width = 1280) {
  const s = width / 1280;
  const lines = titleLines(card.title, "serif", 88, 1120);
  const res = new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 * s, width: 1280 * s, height: 720 * s, padding: `${72 * s}px ${80 * s}px`, background: C.bgInverse, color: C.inverse }}>
        <div style={{ display: "flex", alignItems: "center", gap: 17 * s }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={mascotDataUrl()} width={56 * s} height={56 * s} />
          <div style={{ display: "flex", fontSize: 40 * s, lineHeight: 1.04, ...serif }}>Press F</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 88 * s, lineHeight: 1.04, ...serif }}>
          {lines.slice(0, 3).map((l, i) => <div key={i} style={{ display: "flex" }}>{l}</div>)}
        </div>
        <div style={{ display: "flex", fontSize: 26 * s, fontFamily: "Geologica", fontWeight: 500 }}>{card.line}</div>
      </div>
    ),
    { width: Math.round(1280 * s), height: Math.round(720 * s), fonts: ogFonts() },
  );
  return new Uint8Array(await res.arrayBuffer());
}

// Bar heights of the waveform in the design (first 12 played, the rest ahead).
const WAVE = [95.73, 87.11, 59.83, 108.42, 27.48, 104.42, 72.64, 76.26, 102.74, 31.99, 109.15, 55.71, 90.05, 93.18, 50.9, 109.71, 37.1, 100.57, 80.2, 68.36, 106.07, 22.31, 107.31, 64.4, 83.56, 98.4, 41.61, 109.96, 46.52, 95.78];

/** Cover/Audio art 1:1, 600×600 (pass `size` to scale). */
export async function audioArtPng(card: MediaCard, size = 600) {
  const s = size / 600;
  const lines = titleLines(card.title, "serif", 56, 504);
  const res = new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 * s, width: size, height: size, padding: 48 * s, background: C.plum, color: C.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 * s }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={mascotDataUrl()} width={44 * s} height={44 * s} />
          <div style={{ display: "flex", fontSize: 32 * s, lineHeight: 1.15, ...serif }}>Press F</div>
        </div>
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 * s, height: 110 * s }}>
          {WAVE.map((h, i) => <div key={i} style={{ display: "flex", width: 9 * s, height: h * s, borderRadius: 4 * s, background: i < 12 ? C.coverLineStrong : C.coverLine }} />)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 56 * s, lineHeight: 1.04, ...serif }}>
          {lines.slice(0, 2).map((l, i) => <div key={i} style={{ display: "flex" }}>{l}</div>)}
        </div>
        <div style={{ display: "flex", fontSize: 18 * s, fontFamily: "Geologica", fontWeight: 500, color: C.secondary }}>{card.line}</div>
      </div>
    ),
    { width: size, height: size, fonts: ogFonts() },
  );
  return new Uint8Array(await res.arrayBuffer());
}
