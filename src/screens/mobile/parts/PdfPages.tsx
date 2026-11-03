"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { openLink } from "@/platform/client";
import s from "./File.module.css";

/**
 * Mobile PDF preview: pdf.js draws the pages onto canvases stacked in the
 * page's own scroll (iOS WebViews show a PDF iframe as one static page). pdf.js
 * loads only here, on demand. The first page draws at once, the rest as they
 * come near the screen; pages far away give their canvas back (iOS caps canvas
 * memory). Tapping a page opens the whole file in the system viewer.
 */
const MAX_PAGES = 30;
const A4 = 297 / 210;

type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<Pdfjs> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    }
    return pdfjs;
  });
  pdfjsPromise.catch(() => (pdfjsPromise = null));
  return pdfjsPromise;
}

export function PdfPages({ src, openUrl, title, pages, fallback }: { src: string; openUrl: string; title: string; pages: number | null; fallback: ReactNode }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [ratios, setRatios] = useState<number[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let task: ReturnType<Pdfjs["getDocument"]> | null = null;
    loadPdfjs()
      .then(async (pdfjs) => {
        if (!live) return;
        task = pdfjs.getDocument({ url: src, isEvalSupported: false, verbosity: 0 });
        const pdf = await task.promise;
        if (!live) return;
        // Page shapes up front (cheap: no drawing) so every placeholder has its final height.
        const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
        const out = [first.height / first.width];
        setDoc(pdf);
        setRatios(out.slice());
        for (let i = 2; i <= Math.min(pdf.numPages, MAX_PAGES) && live; i++) {
          const v = (await pdf.getPage(i)).getViewport({ scale: 1 });
          out.push(v.height / v.width);
        }
        if (live) setRatios(out);
      })
      .catch((error) => {
        if (!live) return;
        console.error("PDF preview failed", error);
        setFailed(true);
      });
    return () => {
      live = false;
      void task?.destroy();
    };
  }, [src]);

  if (failed) return <>{fallback}</>;
  const total = doc?.numPages ?? pages ?? 1;
  const shown = Math.min(total, MAX_PAGES);
  // Until a page's shape is known it takes the first page's (or A4's) — they rarely differ.
  const ratioOf = (i: number) => ratios[i] ?? ratios[0] ?? A4;
  return (
    <div className={s.pages} aria-label={`Preview of ${title}`} role="document">
      {Array.from({ length: doc ? shown : 1 }, (_, i) => (
        <PdfPage key={i} doc={doc} index={i} ratio={ratioOf(i)} label={`Page ${i + 1} of ${total}`} onOpen={() => openLink(new URL(openUrl, location.href).href)} />
      ))}
      {doc && total > shown ? (
        <button type="button" className={s.more} onClick={() => openLink(new URL(openUrl, location.href).href)}>
          {total - shown} more {total - shown === 1 ? "page" : "pages"} · Open the full file
        </button>
      ) : null}
    </div>
  );
}

function PdfPage({ doc, index, ratio, label, onOpen }: { doc: PDFDocumentProxy | null; index: number; ratio: number; label: string; onOpen: () => void }) {
  const box = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(index === 0);
  const [width, setWidth] = useState(0);
  const [drawn, setDrawn] = useState(false);

  // Near = within about two screens; leaving that range frees the canvas.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting || index === 0), { rootMargin: "200% 0px" });
    io.observe(el);
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, [index]);

  useEffect(() => {
    const c = canvas.current;
    if (!doc || !c || !near || !width) return;
    let live = true;
    let render: { cancel(): void } | null = null;
    doc
      .getPage(index + 1)
      .then((page) => {
        if (!live) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: (width * dpr) / page.getViewport({ scale: 1 }).width });
        // Draw off-screen, then swap in: the old bitmap stays up until the new one is ready.
        const off = document.createElement("canvas");
        off.width = Math.floor(viewport.width);
        off.height = Math.floor(viewport.height);
        const ctx = off.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        const task = page.render({ canvasContext: ctx, viewport });
        render = task;
        return task.promise.then(() => {
          if (!live) return;
          c.width = off.width;
          c.height = off.height;
          c.getContext("2d")?.drawImage(off, 0, 0);
          off.width = off.height = 0;
          setDrawn(true);
        });
      })
      .catch((error: unknown) => {
        if ((error as Error)?.name !== "RenderingCancelledException") console.error("PDF page failed", index + 1, error);
      });
    return () => {
      live = false;
      render?.cancel();
    };
  }, [doc, index, near, width]);

  // Far away: hand the bitmap back.
  useEffect(() => {
    if (near || !canvas.current) return;
    canvas.current.width = canvas.current.height = 0;
    setDrawn(false);
  }, [near]);

  return (
    <button ref={box} type="button" className={s.page} style={{ aspectRatio: `1 / ${ratio}` }} aria-label={`${label} — open the file`} onClick={onOpen}>
      <canvas ref={canvas} className={s.canvas} hidden={!drawn} />
      {drawn ? null : <span className={s.pageSkeleton} aria-hidden />}
    </button>
  );
}
