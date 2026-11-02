"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { miniAppUrl } from "@/core/links";
import { parseQr, shouldRetry } from "@/core/qr";
import { clock } from "@/core/time";
import { checkIn, type CheckIn } from "../actions";
import s from "../mobile.module.css";
import { Tag, type TagTone } from "@/ui/components";
import { QrIcon } from "@/ui/icons";
import { ActionSheet } from "./ActionSheet";
import { BottomBar } from "./BottomBar";
import { addToHomeScreen, haptic, homeScreenStatus, scanQr } from "./telegram";
import { useToast } from "./toast";

/**
 * Attendance check-in: Telegram's scanner → parseQr on the device → the LMS
 * through a server action with the student's session. Offline scans are kept
 * and retried for two minutes (core/qr shouldRetry).
 */

type Result = CheckIn | { kind: "camera-off" } | { kind: "unsupported" };
type Phase = { at: "idle" } | { at: "busy" } | { at: "result"; result: Result } | { at: "shortcut" };

const PENDING = "pf_qr_pending";
const SHORTCUT = "pf_qr_shortcut_offered";
const RETRY_EVERY_MS = 10_000;

const store = {
  get<T>(key: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

type Pending = { text: string; at: number };

const HAPTIC: Partial<Record<Result["kind"], "success" | "error" | "warning">> = {
  marked: "success", expired: "error", "not-your-class": "error", "not-found": "error", invalid: "error", error: "error", offline: "warning", "camera-off": "warning", signin: "warning",
};

export type QrFlowProps = {
  /** Open the scanner as soon as the screen mounts (the /qr shortcut). */
  autoStart?: boolean;
  /** The class being checked into, for the result copy ("until 11:20"). */
  classEnd?: string;
  /** "Physics 1 · A-108", shown when the LMS reply names no class. */
  classLine?: string;
  /** Show the "Scan attendance QR" bottom button while idle. */
  idleButton?: boolean;
  /** Called with the class result so the parent can show its own state. */
  onDone?: () => void;
  /** Start on a given sheet (dev preview of the Figma states). */
  initial?: Result | "shortcut";
};

export type QrResult = Result;

export function QrFlow({ autoStart, classEnd, classLine, idleButton = true, onDone, initial }: QrFlowProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(initial === "shortcut" ? { at: "shortcut" } : initial ? { at: "result", result: initial } : { at: "idle" });
  const retry = useRef<ReturnType<typeof setInterval> | null>(null);
  const [toastView, toast] = useToast();

  const show = useCallback((result: Result) => {
    const h = HAPTIC[result.kind];
    if (h) haptic(h);
    setPhase({ at: "result", result });
  }, []);

  const send = useCallback(
    async (text: string, scannedAt: number) => {
      setPhase({ at: "busy" });
      let result: CheckIn;
      try {
        result = await checkIn(text);
      } catch {
        result = { kind: "offline" };
      }
      if (result.kind === "offline" && shouldRetry(new Date(scannedAt), new Date())) store.set(PENDING, { text, at: scannedAt } satisfies Pending);
      else store.set(PENDING, null);
      show(result);
    },
    [show],
  );

  const scan = useCallback(async () => {
    setPhase({ at: "busy" });
    const r = await scanQr("Point at the code on the classroom screen");
    if (r.kind === "closed") return setPhase({ at: "idle" });
    if (r.kind !== "text") return show(r);
    const parsed = parseQr(r.text);
    if (!parsed.ok) return show({ kind: "invalid" });
    await send(r.text, Date.now());
  }, [send, show]);

  // Retry a scan kept while offline, quietly, while the code can still be valid.
  useEffect(() => {
    const tick = async () => {
      const p = store.get<Pending>(PENDING);
      if (!p) return;
      if (!shouldRetry(new Date(p.at), new Date())) {
        // Two minutes passed offline: the code is no longer valid.
        store.set(PENDING, null);
        return show({ kind: "error", message: "offline too long" });
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const result = await checkIn(p.text).catch((): CheckIn => ({ kind: "offline" }));
      if (result.kind === "offline") return;
      store.set(PENDING, null);
      show(result);
    };
    retry.current = setInterval(tick, RETRY_EVERY_MS);
    window.addEventListener("online", tick);
    return () => {
      if (retry.current) clearInterval(retry.current);
      window.removeEventListener("online", tick);
    };
  }, [show]);

  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    // Let the Telegram SDK settle before opening the scanner.
    const t = setTimeout(scan, 300);
    return () => clearTimeout(t);
  }, [autoStart, scan]);

  const close = useCallback(async () => {
    const wasMarked = phase.at === "result" && phase.result.kind === "marked";
    if (wasMarked && !store.get(SHORTCUT)) {
      const status = await homeScreenStatus();
      if (status === "missed" || status === "unknown") {
        store.set(SHORTCUT, true);
        return setPhase({ at: "shortcut" });
      }
    }
    setPhase({ at: "idle" });
    onDone?.();
  }, [phase, onDone]);

  if (phase.at === "shortcut")
    return (
      <ActionSheet
        title="Scan in one tap"
        onClose={() => setPhase({ at: "idle" })}
        main={{ text: "Add to home screen", onClick: () => (addToHomeScreen(() => toast("Press F added to your home screen")), setPhase({ at: "idle" })) }}
        secondary={{ text: "Not now", onClick: () => setPhase({ at: "idle" }) }}
      >
        <span className={s.appIcon} aria-hidden>
          <QrIcon size={32} />
        </span>
        <h2 className={`${s.sheetTitle} t-display-xs`}>Scan in one tap</h2>
        <p className={s.sheetBody}>Put a Scan QR icon on your home screen. Tap it in class and the scanner opens straight away — no menus.</p>
        <p className={s.sheetSmall}>Shown once, after your first QR check-in.</p>
      </ActionSheet>
    );

  if (phase.at === "result") {
    const copy = resultCopy(phase.result, classEnd, classLine);
    const main =
      phase.result.kind === "signin"
        ? { text: "Sign in", onClick: () => router.push("/sign-in?next=/qr") }
        : phase.result.kind === "unsupported"
          ? { text: "Open in Telegram", onClick: () => location.assign(miniAppUrl({ to: "qr" })) }
          : phase.result.kind === "offline"
            ? // Figma 10.9: the button spins while the scan waits to be sent.
              { text: "Sending", busy: true, onClick: () => {} }
            : phase.result.kind === "marked"
              ? { text: "Done", onClick: close }
              : { text: copy.action ?? "Scan again", onClick: scan };
    return (
      <ActionSheet title={copy.title} onClose={close} main={main}>
        <span className={s.sheetTag}>
          <Tag tone={copy.tone}>{copy.tag}</Tag>
        </span>
        <h2 className={`${s.sheetTitle} t-display-xs`}>{copy.title}</h2>
        <p className={s.sheetBody}>{copy.body}</p>
        {copy.note && <p className={s.sheetNote}>{copy.note}</p>}
      </ActionSheet>
    );
  }

  return (
    <>
      {toastView}
      <BottomBar visible={idleButton} main={{ text: "Scan attendance QR", busy: phase.at === "busy", onClick: scan }} />
    </>
  );
}

type Copy = { tag: string; tone: TagTone; title: string; body: string; note?: string; action?: string };

const HHMM = /^\d{1,2}:\d{2}/;

/** Sheet copy for a check-in result (Figma 10.3–10.5, 10.8, 10.9). `classLine` is "Physics 1 · A-108" for the class on now. */
export function resultCopy(r: Result, classEnd?: string, classLine?: string, now = new Date()): Copy {
  const still = classEnd ? ` — the class is still running until ${classEnd}.` : ".";
  switch (r.kind) {
    case "marked": {
      const time = r.time && HHMM.test(r.time) ? r.time.slice(0, 5) : clock(now);
      return { tag: `Present · ${time}`, tone: "accent", title: "You're marked", body: r.subject ?? classLine ?? "Your check-in is in the LMS." };
    }
    case "expired":
      return { tag: "Not marked", tone: "management", title: "This code expired", body: "Codes refresh every few seconds.", note: "Ask the teacher to show the code again and scan once more." };
    case "not-your-class":
      return { tag: "Not marked", tone: "engineering", title: "This code isn't for your class", body: r.subject ? `It belongs to ${r.subject}.` : "It belongs to another class.", note: "Check you're in the right room. If this is your class, tell the teacher." };
    case "not-found":
    case "invalid":
      return { tag: "Not marked", tone: "management", title: "That isn't an attendance code", body: "Scan the QR code your teacher shows for attendance." };
    case "offline":
      return { tag: "Saved", tone: "management", title: "Scanned — sending when online", body: "No internet right now. We keep the scan for 2 minutes." };
    case "signin":
      return { tag: "Signed out", tone: "engineering", title: "Sign in to check in", body: "Your LMS sign-in stopped working. Sign in again, then scan." };
    case "camera-off":
      return { tag: "Camera off", tone: "management", title: "Telegram can't use the camera", body: "Allow camera access for Telegram in your phone settings.", note: `Or ask the teacher to mark you${still}`, action: "Try again" };
    case "unsupported":
      return { tag: "Telegram only", tone: "management", title: "Scan in Telegram", body: "Attendance codes are scanned in the Press F Mini App, with Telegram's camera." };
    default:
      return { tag: "LMS error", tone: "engineering", title: "The LMS didn't answer", body: "Your check-in didn't go through. Scan the code again.", note: `If it keeps failing, ask the teacher to mark you${still}` };
  }
}
