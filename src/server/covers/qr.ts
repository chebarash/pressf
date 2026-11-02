import { encode } from "uqr";

/** QR modules (true = dark) for a URL, without a quiet zone; the white tile around it is the cover's. */
export function qrMatrix(text: string): boolean[][] {
  return encode(text, { ecc: "M", border: 0 }).data;
}

/** The QR as an SVG string, for image rendering. */
export function qrSvg(text: string, size: number, ink: string) {
  const m = qrMatrix(text);
  const n = m.length;
  const rects: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!m[y][x]) continue;
      let run = 1;
      while (x + run < n && m[y][x + run]) run++;
      rects.push(`M${x} ${y}h${run}v1h-${run}z`);
      x += run - 1;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path fill="${ink}" d="${rects.join("")}"/></svg>`;
}
