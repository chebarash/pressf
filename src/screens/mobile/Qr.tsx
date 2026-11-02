import Link from "next/link";
import type { TodayView } from "@/server/views";
import "@/ui/tokens.css";
import s from "./mobile.module.css";
import { QrFlow, type QrFlowProps } from "./parts/QrFlow";

/**
 * `/qr`, the Scan QR shortcut target (Figma 10.2–10.9): Telegram's scanner
 * opens straight away and results show as sheets over this screen. It reads
 * the Today view for the class a check-in would count for.
 */
export default function Qr({ data, preview }: { data: TodayView | null; preview?: QrFlowProps["initial"] }) {
  const c = data?.tiles.qrOpen ? (data.current ?? data.next) : null;
  return (
    <div className={s.screen}>
      <header className={s.head}>
        <h1 className={`${s.title} t-mobile-title`}>Scan QR</h1>
        <p className={`${s.subtitle} t-body-md`}>{c ? `${c.name} · until ${c.endTime}` : "Attendance check-in"}</p>
      </header>
      <div className={s.qrIdle}>
        {c ? (
          <section className={s.hero} aria-label="Class now">
            <p className={s.heroEyebrow}>In class now</p>
            <p className={`${s.heroTitle} t-mobile-section`}>{c.name}</p>
            <p className={s.heroSub}>{[`${c.time}–${c.endTime}`, c.room].filter(Boolean).join(" · ")}</p>
          </section>
        ) : (
          <p className={s.qrLead}>Point the camera at the code your teacher shows. Your check-in goes straight to the LMS.</p>
        )}
        <Link href="/" className={s.sectionAll}>
          Back to Today
        </Link>
      </div>
      <QrFlow autoStart={!preview} initial={preview} classEnd={c?.endTime} classLine={c ? [c.name, c.room].filter(Boolean).join(" · ") : undefined} />
    </div>
  );
}
