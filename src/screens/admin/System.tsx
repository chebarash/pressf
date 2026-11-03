"use client";

import { useState, useTransition } from "react";
import { runJob, setSetting } from "@/app/admin/actions";
import type { systemPage } from "@/server/admin/views";
import { Btn, Chip, Head, KV, cx, s } from "./ui";
import type { SortColumns } from "@/core/sort";
import { SortHeader, useSortedRows } from "@/ui/table/Sort";

export type SystemData = Awaited<ReturnType<typeof systemPage>>;

/** "15 min", "1 h", "daily 03:00" → minutes, so EVERY sorts by how often. */
const everyMinutes = (e: string) => {
  const m = e.match(/(\d+)\s*(min|h)\b/);
  return m ? Number(m[1]) * (m[2] === "h" ? 60 : 1) : /daily/.test(e) ? 1440 : /weekly/.test(e) ? 10080 : null;
};
/** "1,234 students" → 1234. */
const leadingNumber = (x: string) => {
  const m = x.replace(/,/g, "").match(/^\d+/);
  return m ? Number(m[0]) : x;
};
const JOB_COLUMNS: SortColumns<SystemData["jobs"][number], "job" | "every" | "lastRun" | "result"> = {
  job: (j) => j.name,
  every: (j) => everyMinutes(j.every),
  lastRun: (j) => (j.lastRun ? Date.parse(j.lastRun) : null),
  result: (j) => leadingNumber(j.result),
};

/** A10 System (admin only): run a job now, pause LMS syncing, maintenance banner. */
export function System({ data }: { data: SystemData }) {
  const [pending, start] = useTransition();
  const [maintenance, setMaintenance] = useState(data.maintenance);
  const [paused, setPaused] = useState(data.lms.syncPaused);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sort = useSortedRows(data.jobs, JOB_COLUMNS);

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
          <SortHeader state={sort.state} k="job" className={cx(s.td, s.tdGrow)}>JOB</SortHeader>
          <SortHeader state={sort.state} k="every" className={s.td} style={{ width: 150 }}>EVERY</SortHeader>
          <SortHeader state={sort.state} k="lastRun" className={s.td} style={{ width: 140 }}>LAST RUN</SortHeader>
          <SortHeader state={sort.state} k="result" className={s.td} style={{ width: 120 }}>RESULT</SortHeader>
          <span className={s.td} style={{ width: 110 }} />
        </div>
        {sort.rows.map((j) => (
          <div key={j.id} className={s.tr}>
            <span className={cx(s.td, s.tdGrow, s.tdStrong)}>{j.name}</span>
            <span className={s.td} style={{ width: 150 }}>{j.every}</span>
            <span className={s.td} style={{ width: 140 }} title={j.lastRun ?? undefined}>{j.lastRunText}</span>
            <span className={s.td} style={{ width: 120 }}>{j.result}</span>
            <span className={cx(s.td, s.tdChip, s.hstack)} style={{ width: 110 }}>
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
          <h2 className={s.h4}>LMS</h2>
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
          <h2 className={s.h4}>Bot</h2>
          <KV k="Linked" wide>{data.bot.linked.toLocaleString("en-US")} students</KV>
          <KV k="Delivered" wide>{data.bot.delivered}</KV>
          <KV k="Blocked us" wide>Not tracked yet</KV>
        </section>
      </div>
      <section className={cx(s.cardSoft, s.tintMustard)} style={{ gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
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
