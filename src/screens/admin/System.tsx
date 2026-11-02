"use client";

import { useState, useTransition } from "react";
import { runJob, setSetting } from "@/app/admin/actions";
import type { systemPage } from "@/server/admin/views";
import { Btn, Chip, Head, KV, cx, s } from "./ui";

export type SystemData = Awaited<ReturnType<typeof systemPage>>;

/** A10 System (admin only): run a job now, pause LMS syncing, maintenance banner. */
export function System({ data }: { data: SystemData }) {
  const [pending, start] = useTransition();
  const [maintenance, setMaintenance] = useState(data.maintenance);
  const [paused, setPaused] = useState(data.lms.syncPaused);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (key: "maintenance" | "sync-paused", on: boolean, set: (v: boolean) => void) => {
    set(on);
    start(async () => {
      const r = await setSetting(key, on);
      if (!r.ok) set(!on);
      setMsg(r.ok ? null : { ok: false, text: r.error });
    });
  };
  const run = (job: "sync" | "harvest", name: string) =>
    start(async () => {
      const r = await runJob(job);
      setMsg(r.ok ? { ok: true, text: `${name} started` } : { ok: false, text: r.error });
    });

  return (
    <section className={s.main}>
      <Head title="System" sub="Background jobs, LMS connection and the bot" />
      <div className={cx(s.card, s.table)}>
        <div className={cx(s.tr, s.trHead)}>
          <span className={cx(s.td, s.tdGrow)}>JOB</span>
          <span className={s.td} style={{ width: 150 }}>EVERY</span>
          <span className={s.td} style={{ width: 140 }}>LAST RUN</span>
          <span className={s.td} style={{ width: 120 }}>RESULT</span>
          <span className={s.td} style={{ width: 160 }} />
        </div>
        {data.jobs.map((j) => (
          <div key={j.id} className={s.tr}>
            <span className={cx(s.td, s.tdGrow, s.tdStrong)}>{j.name}</span>
            <span className={s.td} style={{ width: 150 }}>{j.every}</span>
            <span className={s.td} style={{ width: 140 }} title={j.lastRun ?? undefined}>{j.lastRunText}</span>
            <span className={s.td} style={{ width: 120 }}>{j.result}</span>
            <span className={cx(s.td, s.tdChip, s.hstack)} style={{ width: 160 }}>
              <Chip tone={j.ok ? "moss" : "mustard"}>{j.ok ? "OK" : "Late"}</Chip>
              {j.run && (
                <button type="button" className={s.link} style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }} onClick={() => run(j.run!, j.name)} disabled={pending}>
                  Run now
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className={s.row2}>
        <section className={s.cardSoft} style={{ flex: "1 0 0" }}>
          <h2 className={s.h3}>LMS</h2>
          <KV k="API" wide>{data.lms.api}</KV>
          <KV k="Sign-ins" wide>{data.lms.signIns}</KV>
          <KV k="Pause syncing" wide>
            <span className={s.hstack}>
              {paused ? "On — no LMS calls from jobs" : "Off"}
              <button type="button" className={s.link} style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }} onClick={() => toggle("sync-paused", !paused, setPaused)} disabled={pending}>
                {paused ? "Resume" : "Pause"}
              </button>
            </span>
          </KV>
        </section>
        <section className={s.cardSoft} style={{ flex: "1 0 0" }}>
          <h2 className={s.h3}>Bot</h2>
          <KV k="Linked" wide>{data.bot.linked.toLocaleString("en-US")} students</KV>
          <KV k="Delivered" wide>{data.bot.delivered}</KV>
          <KV k="Blocked us" wide>Not tracked yet</KV>
        </section>
      </div>
      <section className={cx(s.cardSoft, s.tintMustard)} style={{ gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-on-warm)" }}>
          Maintenance banner — shows &apos;Press F is updating, back in a few minutes&apos; to everyone{maintenance ? " · on now" : ""}
        </div>
        <div>
          <Btn onClick={() => toggle("maintenance", !maintenance, setMaintenance)} disabled={pending}>{maintenance ? "Turn off" : "Turn on"}</Btn>
        </div>
      </section>
      {msg && <div className={msg.ok ? s.small : s.error}>{msg.text}</div>}
    </section>
  );
}
