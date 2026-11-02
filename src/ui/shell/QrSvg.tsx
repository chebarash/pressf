import type { QrData } from "./qr";

/** Draws a qrPath() result in document ink on document paper. */
export function QrSvg({ qr, size, className, label }: { qr: QrData; size: number; className?: string; label?: string }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges" role="img" aria-label={label ?? "QR code"} className={className}>
      <rect width={qr.size} height={qr.size} fill="var(--doc-page)" />
      <path d={qr.path} fill="var(--doc-ink)" />
    </svg>
  );
}
