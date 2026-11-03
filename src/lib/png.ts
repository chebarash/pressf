/**
 * A small PNG reader and writer for the face constructor (8-bit, non-interlaced:
 * what the Notion Faces parts use). Pixels are straight (non-premultiplied) RGBA.
 * Server-side only (node:zlib).
 */
import { deflateSync, inflateSync } from "node:zlib";

export type Rgba = { width: number; height: number; data: Uint8Array };

const MAGIC = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decodes an 8-bit, non-interlaced PNG (grey, RGB, palette, grey+alpha, RGBA) to RGBA. */
export function decodePng(bytes: Uint8Array): Rgba {
  if (MAGIC.some((v, i) => bytes[i] !== v)) throw new Error("Not a PNG");
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette: Uint8Array | null = null, trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const len = u32(bytes, at);
    const name = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const body = bytes.subarray(at + 8, at + 8 + len);
    if (name === "IHDR") {
      width = u32(body, 0);
      height = u32(body, 4);
      depth = body[8];
      type = body[9];
      interlace = body[12];
    } else if (name === "PLTE") palette = body;
    else if (name === "tRNS") trns = body;
    else if (name === "IDAT") idat.push(body);
    else if (name === "IEND") break;
    at += 12 + len;
  }
  const channels = CHANNELS[type];
  if (depth !== 8 || !channels || interlace) throw new Error(`Unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[row + x - channels] : 0;
      const b = y ? px[prev + x] : 0;
      const c = y && x >= channels ? px[prev + x - channels] : 0;
      const v = raw[src + x];
      px[row + x] = (filter === 0 ? v : filter === 1 ? v + a : filter === 2 ? v + b : filter === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const o = i * 4;
    if (type === 6) data.set(px.subarray(o, o + 4), o);
    else if (type === 4) {
      data[o] = data[o + 1] = data[o + 2] = px[i * 2];
      data[o + 3] = px[i * 2 + 1];
    } else if (type === 0) {
      data[o] = data[o + 1] = data[o + 2] = px[i];
      data[o + 3] = trns && trns.length >= 2 && px[i] === trns[1] ? 0 : 255;
    } else if (type === 2) {
      data[o] = px[i * 3];
      data[o + 1] = px[i * 3 + 1];
      data[o + 2] = px[i * 3 + 2];
      data[o + 3] = trns && trns.length >= 6 && px[i * 3] === trns[1] && px[i * 3 + 1] === trns[3] && px[i * 3 + 2] === trns[5] ? 0 : 255;
    } else {
      const k = px[i];
      if (!palette || k * 3 + 2 >= palette.length) throw new Error("PNG palette index out of range");
      data[o] = palette[k * 3];
      data[o + 1] = palette[k * 3 + 1];
      data[o + 2] = palette[k * 3 + 2];
      data[o + 3] = trns && k < trns.length ? trns[k] : 255;
    }
  }
  return { width, height, data };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function chunk(name: string, body: Uint8Array) {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i);
  out.set(body, 8);
  let c = 0xffffffff;
  for (let i = 4; i < 8 + body.length; i++) c = CRC[(c ^ out[i]) & 255] ^ (c >>> 8);
  view.setUint32(8 + body.length, (c ^ 0xffffffff) >>> 0);
  return out;
}

/**
 * Encodes RGBA as a PNG: grey+alpha when every pixel is grey (the Notion parts
 * are), RGBA otherwise. Rows use the filter with the smallest output (the usual
 * heuristic); the same pixels always give the same bytes.
 */
export function encodePng({ width, height, data }: Rgba): Uint8Array {
  let grey = true;
  for (let i = 0; grey && i < data.length; i += 4) if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) grey = false;
  const channels = grey ? 2 : 4;
  const stride = width * channels;
  const px = new Uint8Array(stride * height);
  for (let i = 0, n = width * height; i < n; i++) {
    if (grey) {
      // Fully transparent pixels carry no colour: zero them so they compress.
      px[i * 2] = data[i * 4 + 3] ? data[i * 4] : 0;
      px[i * 2 + 1] = data[i * 4 + 3];
    } else if (data[i * 4 + 3]) px.set(data.subarray(i * 4, i * 4 + 4), i * 4);
  }
  const raw = new Uint8Array((stride + 1) * height);
  const line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const row = y * stride, prev = row - stride;
    let best = -1, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? px[row + x - channels] : 0;
        const b = y ? px[prev + x] : 0;
        const c = y && x >= channels ? px[prev + x - channels] : 0;
        const v = px[row + x];
        const out = (f === 0 ? v : f === 1 ? v - a : f === 2 ? v - b : f === 3 ? v - ((a + b) >> 1) : v - paeth(a, b, c)) & 255;
        sum += out < 128 ? out : 256 - out;
        if (sum >= bestSum) break;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[row + x - channels] : 0;
      const b = y ? px[prev + x] : 0;
      const c = y && x >= channels ? px[prev + x - channels] : 0;
      const v = px[row + x];
      line[x] = (best === 0 ? v : best === 1 ? v - a : best === 2 ? v - b : best === 3 ? v - ((a + b) >> 1) : v - paeth(a, b, c)) & 255;
    }
    raw.set(line, y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = grey ? 4 : 6;
  const parts = [Uint8Array.from(MAGIC), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array(0))];
  return new Uint8Array(Buffer.concat(parts));
}

/** Draws `top` over `base` in place ("source-over", same size). */
export function drawOver(base: Rgba, top: Rgba) {
  if (base.width !== top.width || base.height !== top.height) throw new Error("Layers differ in size");
  const d = base.data, s = top.data;
  for (let i = 0; i < d.length; i += 4) {
    const sa = s[i + 3];
    if (!sa) continue;
    if (sa === 255) {
      d[i] = s[i];
      d[i + 1] = s[i + 1];
      d[i + 2] = s[i + 2];
      d[i + 3] = 255;
      continue;
    }
    const da = d[i + 3];
    const outA = sa * 255 + da * (255 - sa); // ×255
    for (let k = 0; k < 3; k++) d[i + k] = Math.round((s[i + k] * sa * 255 + d[i + k] * da * (255 - sa)) / outA);
    d[i + 3] = Math.round(outA / 255);
  }
}

/** The square [x, y, x+size) window of an image; outside it is transparent. */
export function crop(img: Rgba, x: number, y: number, size: number): Rgba {
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    const sy = y + row;
    if (sy < 0 || sy >= img.height) continue;
    const from = Math.max(0, x), to = Math.min(img.width, x + size);
    if (to <= from) continue;
    data.set(img.data.subarray((sy * img.width + from) * 4, (sy * img.width + to) * 4), (row * size + (from - x)) * 4);
  }
  return { width: size, height: size, data };
}

/** Shrinks a square image to `size`×`size` by area averaging (alpha-weighted, so edges stay clean). */
export function shrink(img: Rgba, size: number): Rgba {
  const out = new Uint8Array(size * size * 4);
  const scale = img.width / size;
  for (let oy = 0; oy < size; oy++) {
    const y0 = Math.floor(oy * scale), y1 = Math.max(y0 + 1, Math.floor((oy + 1) * scale));
    for (let ox = 0; ox < size; ox++) {
      const x0 = Math.floor(ox * scale), x1 = Math.max(x0 + 1, Math.floor((ox + 1) * scale));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * img.width + x) * 4, al = img.data[i + 3];
          r += img.data[i] * al;
          g += img.data[i + 1] * al;
          b += img.data[i + 2] * al;
          a += al;
          n++;
        }
      const o = (oy * size + ox) * 4;
      if (a) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round(a / n);
    }
  }
  return { width: size, height: size, data: out };
}
