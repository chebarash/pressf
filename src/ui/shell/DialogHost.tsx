"use client";

import { useEffect, useSyncExternalStore } from "react";
import { dialog } from "@/platform/store";

/** Draws confirm()/popup() from `@/platform/native` outside Telegram (8.2 look). */
export function DialogHost() {
  const request = useSyncExternalStore(dialog.subscribe, dialog.get, () => null);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      dialog.set(null);
      if (request.kind === "confirm") request.resolve(false);
      else request.resolve(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [request]);

  if (!request) return null;
  const buttons = request.kind === "confirm"
    ? [
        { id: "cancel", text: request.cancel ?? "Cancel", type: "default" as const },
        { id: "ok", text: request.ok ?? "OK", type: request.destructive ? ("destructive" as const) : ("default" as const) },
      ]
    : request.buttons.map((b) => ({ ...b, text: b.type === "cancel" && !b.text ? "Cancel" : b.text }));
  const answer = (id: string | null) => {
    dialog.set(null);
    if (request.kind === "confirm") request.resolve(id === "ok");
    else request.resolve(id);
  };

  return (
    <>
      <div className="sh-scrim" onClick={() => answer(null)} />
      <div className="sh-dialog-wrap" onClick={(e) => { if (e.target === e.currentTarget) answer(null); }}>
        <div className="sh-popup" role="alertdialog" aria-modal="true" aria-labelledby="sh-popup-title" aria-describedby="sh-popup-text">
          <div className="sh-popup__body">
            {request.title && <h2 className="sh-popup__title" id="sh-popup-title">{request.title}</h2>}
            <p className="sh-popup__text" id="sh-popup-text">{request.message}</p>
          </div>
          <div className="sh-popup__actions">
            {buttons.map((b, i) => (
              <button key={b.id} type="button" data-type={b.type} autoFocus={i === buttons.length - 1} onClick={() => answer(b.id)}>{b.text}</button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
