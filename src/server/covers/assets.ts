import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { lightColor } from "@/ui/build-tokens";

/**
 * Fonts, the mascot and colours shared by covers and share previews.
 * Geologica ships as a variable font, which image rendering and PDF subsetting
 * cannot use, so the three weights the design uses are static instances
 * (CRSV 0, SHRP 0) generated from it. Licences sit next to the fonts.
 */

export const ASSETS_DIR = join(process.cwd(), "src/server/covers/assets");

export type FontKey = "serif" | "regular" | "medium" | "semibold";

const FILES: Record<FontKey, string> = {
  serif: "InstrumentSerif-Regular.ttf",
  regular: "Geologica-Regular.ttf",
  medium: "Geologica-Medium.ttf",
  semibold: "Geologica-SemiBold.ttf",
};

const bytes = new Map<string, Buffer>();
const read = (file: string) => {
  let b = bytes.get(file);
  if (!b) bytes.set(file, (b = readFileSync(join(ASSETS_DIR, file))));
  return b;
};

export const fontBytes = (key: FontKey) => read(FILES[key]);
export const mascotPng = () => read("mascot.png");
export const mascotDataUrl = () => `data:image/png;base64,${mascotPng().toString("base64")}`;

/** Fonts for next/og: names and weights the JSX refers to. */
export function ogFonts() {
  return [
    { name: "Instrument Serif", data: fontBytes("serif"), weight: 400 as const, style: "normal" as const },
    { name: "Geologica", data: fontBytes("regular"), weight: 400 as const, style: "normal" as const },
    { name: "Geologica", data: fontBytes("medium"), weight: 500 as const, style: "normal" as const },
    { name: "Geologica", data: fontBytes("semibold"), weight: 600 as const, style: "normal" as const },
  ];
}

export const FAMILY: Record<FontKey, { family: string; weight: 400 | 500 | 600 }> = {
  serif: { family: "Instrument Serif", weight: 400 },
  regular: { family: "Geologica", weight: 400 },
  medium: { family: "Geologica", weight: 500 },
  semibold: { family: "Geologica", weight: 600 },
};

type Fk = { unitsPerEm: number; ascent: number; descent: number; lineGap: number; hasGlyphForCodePoint(c: number): boolean; glyphForCodePoint(c: number): { advanceWidth: number } };
const parsed = new Map<FontKey, Fk>();
export function fontkitFont(key: FontKey): Fk {
  let f = parsed.get(key);
  if (!f) parsed.set(key, (f = fontkit.create(fontBytes(key)) as unknown as Fk));
  return f;
}

/** Light-mode token values; covers and previews are always light (paper). */
export const C = {
  page: lightColor("bg/page"),
  sunken: lightColor("bg/sunken"),
  surface: lightColor("bg/surface"),
  ink: lightColor("text/primary"),
  secondary: lightColor("text/secondary"),
  inverse: lightColor("text/inverse"),
  accent: lightColor("text/accent"),
  strong: lightColor("border/strong"),
  subtle: lightColor("border/subtle"),
  key: lightColor("shadow/key"),
  teal: lightColor("tint/teal"),
  rust: lightColor("tint/rust"),
  mustard: lightColor("tint/mustard"),
  plum: lightColor("tint/plum"),
  moss: lightColor("tint/moss"),
  mustardStrong: lightColor("tint/mustard-strong"),
  white: lightColor("native/white"),
  docPage: lightColor("doc/page"),
  docInk: lightColor("doc/ink"),
  docLine: lightColor("doc/line"),
  coverLine: lightColor("cover/line"),
  coverLineStrong: lightColor("cover/line-strong"),
  bgInverse: lightColor("bg/inverse"),
};
