import { deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * Just enough ZIP to add or replace a few entries: everything else is copied
 * byte for byte (never recompressed or renamed). ZIP64, encrypted and
 * multi-disk archives are refused (null), and the caller keeps the original.
 */

export type ZipEntry = {
  name: string;
  method: number;
  flags: number;
  crc: number;
  compressedSize: number;
  size: number;
  time: number;
  date: number;
  /** Compressed bytes as stored. */
  raw: Uint8Array;
  external: number;
  versionMadeBy: number;
  internal: number;
  comment: Uint8Array;
  extra: Uint8Array;
};

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const utf8 = new TextDecoder();

export function readZip(buf: Uint8Array): ZipEntry[] | null {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const disk = v.getUint16(eocd + 4, true);
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  if (disk !== 0 || count === 0xffff || p === 0xffffffff) return null;
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || v.getUint32(p, true) !== 0x02014b50) return null;
    const flags = v.getUint16(p + 8, true);
    const compressedSize = v.getUint32(p + 20, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    if (flags & 1 || compressedSize === 0xffffffff || size === 0xffffffff || local === 0xffffffff) return null;
    if (v.getUint32(local, true) !== 0x04034b50) return null;
    const lName = v.getUint16(local + 26, true);
    const lExtra = v.getUint16(local + 28, true);
    const start = local + 30 + lName + lExtra;
    out.push({
      name: utf8.decode(buf.subarray(p + 46, p + 46 + nameLen)),
      versionMadeBy: v.getUint16(p + 4, true),
      flags,
      method: v.getUint16(p + 10, true),
      time: v.getUint16(p + 12, true),
      date: v.getUint16(p + 14, true),
      crc: v.getUint32(p + 16, true),
      compressedSize,
      size,
      internal: v.getUint16(p + 36, true),
      external: v.getUint32(p + 38, true),
      extra: buf.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen),
      comment: buf.subarray(p + 46 + nameLen + extraLen, p + 46 + nameLen + extraLen + commentLen),
      raw: buf.subarray(start, start + compressedSize),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Uncompressed bytes of an entry. */
export function entryData(e: ZipEntry): Uint8Array {
  if (e.method === 0) return e.raw;
  if (e.method === 8) return new Uint8Array(inflateRawSync(e.raw));
  throw new Error(`Unsupported zip method ${e.method}`);
}

export const entryText = (e: ZipEntry) => utf8.decode(entryData(e));

function dosTime(d = new Date()) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** A new deflated entry. */
export function makeEntry(name: string, data: Uint8Array | string, opts: { store?: boolean; date?: Date } = {}): ZipEntry {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const raw = opts.store ? bytes : new Uint8Array(deflateRawSync(bytes, { level: 9 }));
  const { time, date } = dosTime(opts.date);
  return {
    name, method: opts.store ? 0 : 8, flags: 0x0800, crc: crc32(bytes), compressedSize: raw.length, size: bytes.length,
    time, date, raw, external: 0, versionMadeBy: 20, internal: 0, comment: new Uint8Array(), extra: new Uint8Array(),
  };
}

/** Same entry with new contents (keeps name, date and order). */
export const replaceEntry = (e: ZipEntry, data: Uint8Array | string): ZipEntry => ({ ...makeEntry(e.name, data), time: e.time, date: e.date, external: e.external, versionMadeBy: e.versionMadeBy, flags: (e.flags & 0x0800) | 0x0800 });

export function writeZip(entries: ZipEntry[], comment?: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    // The data descriptor flag (bit 3) is dropped: sizes and CRC go in the local header.
    const flags = e.flags & ~0x0008;
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, e.method, true);
    lv.setUint16(10, e.time, true);
    lv.setUint16(12, e.date, true);
    lv.setUint32(14, e.crc, true);
    lv.setUint32(18, e.compressedSize, true);
    lv.setUint32(22, e.size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    const c = new Uint8Array(46 + name.length + e.extra.length + e.comment.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, e.versionMadeBy, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, e.method, true);
    cv.setUint16(12, e.time, true);
    cv.setUint16(14, e.date, true);
    cv.setUint32(16, e.crc, true);
    cv.setUint32(20, e.compressedSize, true);
    cv.setUint32(24, e.size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, e.extra.length, true);
    cv.setUint16(32, e.comment.length, true);
    cv.setUint16(36, e.internal, true);
    cv.setUint32(38, e.external, true);
    cv.setUint32(42, offset, true);
    c.set(name, 46);
    c.set(e.extra, 46 + name.length);
    c.set(e.comment, 46 + name.length + e.extra.length);
    chunks.push(local, e.raw);
    central.push(c);
    offset += local.length + e.raw.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const tail = comment ?? new Uint8Array();
  const end = new Uint8Array(22 + tail.length);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, tail.length, true);
  end.set(tail, 22);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}
