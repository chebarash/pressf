"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { webApp } from "./TelegramApp";

export type OpenFile = { id: string; name: string };
const BOT = "https://t.me/pupressfbot";

type Page = { getViewport(o: { scale: number }): { width: number; height: number }; render(o: object): { promise: Promise<void> } };
type Pdf = { numPages: number; getPage(n: number): Promise<Page>; destroy(): Promise<void> };

async function loadPdf(url: string): Promise<Pdf> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs.getDocument({ url, disableAutoFetch: true, disableStream: true }).promise as unknown as Pdf;
}

/** Sends the file to the user's chat with the bot and opens that chat. */
async function sendToChat(file: OpenFile) {
  const app = webApp();
  if (!app) return;
  const send = async () => {
    app.MainButton?.showProgress(false);
    const response = await fetch("/api/telegram/send-file", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: file.id, initData: app.initData }) }).catch(() => null);
    app.MainButton?.hideProgress();
    const body = response ? ((await response.json()) as { ok?: boolean; error?: string }) : { error: "failed" };
    if (body.ok) {
      app.HapticFeedback?.notificationOccurred("success");
      app.openTelegramLink(BOT);
    } else if (body.error === "no_access" && app.requestWriteAccess) {
      app.requestWriteAccess((allowed) => { if (allowed) send(); });
    } else if (body.error === "too_big" && app.downloadFile) {
      app.downloadFile({ url: `${location.origin}/files/${file.id}/${encodeURIComponent(file.name)}`, file_name: file.name });
    } else {
      app.HapticFeedback?.notificationOccurred("error");
      app.showAlert?.("Could not send this file. Please try again.");
    }
  };
  await send();
}

function PdfPage({ pdf, number, ratio, zoom, onSeen }: { pdf: Pdf; number: number; ratio: number; zoom: number; onSeen: (page: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current!.parentElement!;
    const seen = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) onSeen(number); }, { rootMargin: "-50% 0px -50% 0px" });
    seen.observe(element);
    return () => seen.disconnect();
  }, [number, onSeen]);
  useEffect(() => {
    const element = canvas.current!;
    let drawn = false;
    const watch = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || drawn) return;
      drawn = true;
      watch.disconnect();
      const page = await pdf.getPage(number);
      const width = element.parentElement!.clientWidth * Math.min(devicePixelRatio * zoom, 3);
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      element.width = viewport.width;
      element.height = viewport.height;
      await page.render({ canvasContext: element.getContext("2d"), viewport }).promise;
    }, { rootMargin: "600px" });
    watch.observe(element);
    return () => watch.disconnect();
  }, [pdf, number, zoom]);
  return <div className="pdf-page" style={{ aspectRatio: String(ratio), width: `${zoom * 100}%` }}><canvas ref={canvas} aria-label={`Page ${number}`} /></div>;
}

/** Shows PDFs on top of the mini app. What it cannot show goes to the chat instead. */
export function FileViewer() {
  const [file, setFile] = useState<OpenFile | null>(null);
  const [pdf, setPdf] = useState<Pdf | null>(null);
  const [ratio, setRatio] = useState(.7);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const close = useCallback(() => { setFile(null); setPdf(null); }, []);

  useEffect(() => {
    const open = (event: Event) => {
      const next = (event as CustomEvent<OpenFile>).detail;
      if (!/\.pdf$/i.test(next.name)) { sendToChat(next); return; }
      history.pushState({ file: next.id }, "");
      setZoom(1);
      setPage(1);
      setFile(next);
    };
    document.addEventListener("tg-file", open);
    addEventListener("popstate", close);
    return () => { document.removeEventListener("tg-file", open); removeEventListener("popstate", close); };
  }, [close]);

  useEffect(() => {
    if (!file) return;
    const app = webApp();
    const send = () => sendToChat(file);
    app?.BackButton.show();
    app?.MainButton?.setText("Send to chat");
    app?.MainButton?.onClick(send);
    app?.MainButton?.show();
    let cancelled = false;
    let opened: Pdf | null = null;
    loadPdf(`/files/${file.id}/${encodeURIComponent(file.name)}`).then(async (loaded) => {
      if (cancelled) return loaded.destroy();
      opened = loaded;
      const first = (await loaded.getPage(1)).getViewport({ scale: 1 });
      setRatio(first.width / first.height);
      setPdf(loaded);
    }).catch(() => {
      if (cancelled) return;
      history.back();
      sendToChat(file);
    });
    return () => {
      cancelled = true;
      (opened as Pdf | null)?.destroy();
      app?.MainButton?.offClick(send);
      app?.MainButton?.hide();
      document.dispatchEvent(new Event("tg-ready"));
    };
  }, [file]);

  if (!file) return null;
  return (
    <div className="pdf-viewer" role="dialog" aria-modal="true" aria-label={file.name}>
      <div className="pdf-bar">
        <span className="grow pdf-title">{file.name.replace(/\.pdf$/i, "")}</span>
        {pdf && <span className="small soft num">{page} / {pdf.numPages}</span>}
        <button className="key cap sm" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - .5))}>−</button>
        <button className="key cap sm" aria-label="Zoom in" disabled={zoom >= 2.5} onClick={() => setZoom((value) => Math.min(2.5, value + .5))}>+</button>
      </div>
      {!pdf && <p className="soft pdf-loading">Opening…</p>}
      {pdf && <div className="pdf-pages">{Array.from({ length: pdf.numPages }, (_, index) => <PdfPage key={`${index}-${zoom}`} pdf={pdf} number={index + 1} ratio={ratio} zoom={zoom} onSeen={setPage} />)}</div>}
    </div>
  );
}
