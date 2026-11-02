import qrcode from "qrcode-generator";

/** A QR code (error correction M) as one SVG path in an n×n box. Server only: keeps the encoder out of the browser. */
export function qrPath(text: string) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let path = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) path += `M${x} ${y}h1v1h-1z`;
  return { size: n, path };
}

export type QrData = ReturnType<typeof qrPath>;
