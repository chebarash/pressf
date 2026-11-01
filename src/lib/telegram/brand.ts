import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, degrees, rgb } from "pdf-lib";

export type BrandDetails = {
  courseCode: string;
  courseName?: string | null;
  type: string;
  term?: string | null;
  hasSolutions: boolean;
  author?: string | null;
};

const INK = rgb(0.071, 0.067, 0.047);
const SOFT = rgb(0.353, 0.337, 0.282);
const PAPER = rgb(0.961, 0.941, 0.839);
const TEAL = rgb(0.165, 0.443, 0.506);
const WHITE = rgb(1, 1, 1);

const A4: [number, number] = [595, 842];
const MARGIN = 48;
const FOOTER_HEIGHT = 30;

const fontPath = (file: string) =>
  join(process.cwd(), "src/lib/telegram/fonts", file);

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1);

/** A font without a glyph would draw a box, so unsupported characters are dropped. */
function drawable(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  return [...text]
    .filter((char) => supported.has(char.codePointAt(0)!))
    .join("");
}

function fit(text: string, font: PDFFont, size: number, width: number): number {
  const current = font.widthOfTextAtSize(text, size);
  return current <= width ? size : Math.floor((size * width) / current);
}

function drawCover(
  page: PDFPage,
  details: BrandDetails,
  serif: PDFFont,
  sans: PDFFont
) {
  const [width, height] = A4;
  const inner = width - MARGIN * 2;
  page.drawRectangle({ x: 0, y: 0, width, height, color: PAPER });

  page.drawText("Press F", {
    x: MARGIN,
    y: height - 76,
    size: 30,
    font: serif,
    color: INK,
  });
  const tagline = "pressf.chebarash.uz";
  page.drawText(tagline, {
    x: width - MARGIN - sans.widthOfTextAtSize(tagline, 11),
    y: height - 70,
    size: 11,
    font: sans,
    color: SOFT,
  });

  // The keycap from the design: an ink edge under a white rounded cap.
  const keyPath = "M 16 0 H 80 A 16 16 0 0 1 96 16 V 80 A 16 16 0 0 1 80 96 H 16 A 16 16 0 0 1 0 80 V 16 A 16 16 0 0 1 16 0 Z";
  const keyTop = height - 120;
  page.drawSvgPath(keyPath, { x: MARGIN, y: keyTop - 6, color: INK });
  page.drawSvgPath(keyPath, {
    x: MARGIN,
    y: keyTop,
    color: WHITE,
    borderColor: INK,
    borderWidth: 2,
  });
  page.drawText("F", {
    x: MARGIN + 48 - serif.widthOfTextAtSize("F", 60) / 2,
    y: keyTop - 70,
    size: 60,
    font: serif,
    color: INK,
  });

  const title = drawable(details.courseName || details.courseCode, serif);
  const titleSize = fit(title, serif, 104, inner);
  page.drawText(title, {
    x: MARGIN,
    y: height - 330,
    size: titleSize,
    font: serif,
    color: INK,
  });

  const subtitle = [capitalize(details.type), details.term]
    .filter(Boolean)
    .join(", ");
  page.drawText(drawable(subtitle, serif), {
    x: MARGIN,
    y: height - 382,
    size: 36,
    font: serif,
    color: TEAL,
  });

  const rows: Array<[string, string]> = [
    ["Course", details.courseCode],
    ["Type", capitalize(details.type)],
    ["Term", details.term ?? "Not stated"],
    ["Solutions", details.hasSolutions ? "Included" : "Not included"],
    ["Source", details.author ? `By ${details.author}` : "Shared by a student"],
  ];
  let y = 300;
  for (const [label, rawValue] of rows) {
    const value = drawable(rawValue, sans);
    page.drawText(label, { x: MARGIN, y, size: 12, font: sans, color: SOFT });
    page.drawText(value, {
      x: width - MARGIN - sans.widthOfTextAtSize(value, 12),
      y,
      size: 12,
      font: sans,
      color: INK,
    });
    page.drawLine({
      start: { x: MARGIN, y: y - 12 },
      end: { x: width - MARGIN, y: y - 12 },
      thickness: 1.5,
      color: INK,
    });
    y -= 36;
  }

  const notice =
    "Shared by students on Press F. Not published or endorsed by New Uzbekistan University.";
  page.drawText(notice, {
    x: MARGIN,
    y: 64,
    size: 10.5,
    font: sans,
    color: SOFT,
    maxWidth: inner,
    lineHeight: 15,
  });
}

function drawFooter(
  page: PDFPage,
  label: string,
  pageLabel: string,
  sans: PDFFont
) {
  const { width } = page.getSize();
  const size = 8.5;
  const y = 12;
  const edge = 24;

  page.drawText("Press F", { x: edge, y, size, font: sans, color: INK });
  page.drawText(label, {
    x: (width - sans.widthOfTextAtSize(label, size)) / 2,
    y,
    size,
    font: sans,
    color: SOFT,
  });
  page.drawText(pageLabel, {
    x: width - edge - sans.widthOfTextAtSize(pageLabel, size),
    y,
    size,
    font: sans,
    color: INK,
  });
}

/**
 * Wraps a PDF in the Press F template: a cover first, a footer on each page.
 * Pages are only scaled to free the footer strip, so exam content stays exact.
 * Throws on encrypted or broken files; the caller then serves the original.
 */
export async function brandPdf(
  original: Buffer,
  details: BrandDetails
): Promise<Buffer> {
  const pdf = await PDFDocument.load(original);
  pdf.registerFontkit(fontkit);

  const [serifBytes, sansBytes] = await Promise.all([
    readFile(fontPath("InstrumentSerif-Regular.ttf")),
    readFile(fontPath("Geologica.ttf")),
  ]);
  const serif = await pdf.embedFont(serifBytes, { subset: true });
  // A variable font loses its outlines when subset, so it is embedded whole.
  const sans = await pdf.embedFont(sansBytes, { subset: false });

  const label = drawable(
    [
      [details.courseCode, details.courseName].filter(Boolean).join(" "),
      [capitalize(details.type), details.term].filter(Boolean).join(", "),
    ].join(" · "),
    sans
  );

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    // Rotated pages draw in a turned coordinate system; leave them as they are.
    if (page.getRotation().angle !== degrees(0).angle) return;
    const { width, height } = page.getSize();
    const scale = (height - FOOTER_HEIGHT) / height;
    page.scaleContent(scale, scale);
    page.translateContent((width - width * scale) / 2, FOOTER_HEIGHT);
    drawFooter(page, label, `${index + 1} / ${pages.length}`, sans);
  });

  drawCover(pdf.insertPage(0, A4), details, serif, sans);

  pdf.setTitle(label);
  pdf.setProducer("Press F");
  return Buffer.from(await pdf.save());
}
