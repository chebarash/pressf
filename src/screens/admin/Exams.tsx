"use client";

import { useRef, useState, useTransition } from "react";
import { addExamSheet, deleteExamSource, refreshExamSource, setExamWindow, uploadExamFile } from "@/app/admin/actions";
import type { examsAdmin } from "@/server/exams";
import { Btn, Chip, Head, Label, cx, s } from "./ui";

export type ExamsData = Awaited<ReturnType<typeof examsAdmin>>;

const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "never";

/** Exams (admin): sheet links and uploads per exam window, and whether regular classes are hidden in each window. */
export function Exams({ data }: { data: ExamsData }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const current = data.windows.find((w) => w.now) ?? data.windows.find((w) => w.starts >= new Date().toISOString().slice(0, 10)) ?? data.windows[0];
  const [win, setWin] = useState(current ? { name: current.kind === "midterm" ? "Midterm" : current.kind === "final" ? "Final" : current.name, starts: current.starts, ends: current.ends } : { name: "Midterm", starts: "", ends: "" });
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const form = () => {
    const f = new FormData();
    f.set("url", url);
    f.set("label", label);
    f.set("window", win.name);
    f.set("starts", win.starts);
    f.set("ends", win.ends);
    return f;
  };
  const go = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, done?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: r.message ?? done ?? "Done" } : { ok: false, text: r.error });
    });

  return (
    <section className={s.main}>
      <Head title="Exams" sub="University exam sheets → each student's exams. During an exam window regular classes are hidden." />

      <section className={s.card}>
        <h2 className={s.h3}>Exam windows</h2>
        <div className={s.table}>
          <div className={cx(s.tr, s.trHead)}>
            <span className={cx(s.td, s.tdGrow)}>WINDOW</span>
            <span className={s.td} style={{ width: 220 }}>DATES</span>
            <span className={s.td} style={{ width: 120 }}>FROM</span>
            <span className={s.td} style={{ width: 240 }}>REGULAR CLASSES</span>
          </div>
          {data.windows.map((w) => (
            <div key={w.key} className={s.tr}>
              <span className={cx(s.td, s.tdGrow, s.tdStrong)}>
                {w.name} {w.now && <Chip tone="moss">NOW</Chip>}
              </span>
              <span className={s.td} style={{ width: 220 }}>{w.starts} – {w.ends}</span>
              <span className={s.td} style={{ width: 120 }}>{w.origin === "calendar" ? "Calendar" : "Admin"}</span>
              <span className={cx(s.td, s.hstack)} style={{ width: 240 }}>
                <Chip tone={w.classes === "hide" ? "mustard" : "plain"}>{w.classes === "hide" ? "Hidden" : "Shown"}</Chip>
                <button type="button" className={s.link} style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }} disabled={pending} onClick={() => go(() => setExamWindow(w.key, { classes: w.classes === "hide" ? "show" : "hide" }), "Saved")}>
                  {w.classes === "hide" ? "Show classes" : "Hide classes"}
                </button>
                <button type="button" className={s.link} style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }} onClick={() => setWin({ name: w.kind === "midterm" ? "Midterm" : w.kind === "final" ? "Final" : w.name, starts: w.starts, ends: w.ends })}>
                  Use
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={s.card}>
        <h2 className={s.h3}>Add a schedule</h2>
        <p className={s.sub}>
          Paste a Google Sheets link shared with &ldquo;anyone with the link&rdquo; (it is re-read every hour while the window is near), or upload the sheet as .xlsx (or one .csv per tab). Only exams and the seats of Press F students
          (matched by student ID) are kept; other students&rsquo; rows are dropped and the file is not stored.
        </p>
        <div className={s.hstack} style={{ flexWrap: "wrap", gap: 12 }}>
          <label className={s.column}>
            <Label>Window</Label>
            <input className={s.inputInline} value={win.name} onChange={(e) => setWin({ ...win, name: e.target.value })} aria-label="Window name" />
          </label>
          <label className={s.column}>
            <Label>From</Label>
            <input type="date" className={s.inputInline} value={win.starts} onChange={(e) => setWin({ ...win, starts: e.target.value })} />
          </label>
          <label className={s.column}>
            <Label>To</Label>
            <input type="date" className={s.inputInline} value={win.ends} onChange={(e) => setWin({ ...win, ends: e.target.value })} />
          </label>
          <label className={s.column} style={{ flex: "1 0 200px" }}>
            <Label>Name</Label>
            <input className={s.input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Students Fall 2026 MidTerm" />
          </label>
        </div>
        <label className={s.column}>
          <Label>Google Sheets link</Label>
          <input className={s.input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
        </label>
        <div className={s.hstack} style={{ gap: 12, flexWrap: "wrap" }}>
          <Btn tone="accent" disabled={pending || !url.trim()} onClick={() => go(() => addExamSheet(form()))}>Add link</Btn>
          <input ref={file} type="file" multiple accept=".xlsx,.csv,.tsv,.html,.htm" aria-label="Sheet files" />
          <Btn
            disabled={pending}
            onClick={() => {
              const f = form();
              const picked = [...(file.current?.files ?? [])];
              if (!picked.length) return setMsg({ ok: false, text: "Choose a file" });
              for (const p of picked) f.append("file", p);
              go(() => uploadExamFile(f));
            }}
          >
            Upload file
          </Btn>
        </div>
        {msg && <p className={msg.ok ? s.note : s.error} role="status">{msg.text}</p>}
      </section>

      <section className={s.card}>
        <h2 className={s.h3}>Sources</h2>
        {!data.sources.length && <p className={s.muted}>No exam schedules yet.</p>}
        {data.sources.map((src) => (
          <div key={src.id} className={s.cardSoft} style={{ gap: 6 }}>
            <div className={s.hstack} style={{ gap: 8 }}>
              <strong style={{ flex: 1, minWidth: 0 }}>{src.label}</strong>
              <Chip tone={src.status === "ok" ? "moss" : src.status === "error" ? "rust" : "plain"}>{src.status.toUpperCase()}</Chip>
              <Chip>{src.origin === "sheet" ? "LINK" : src.origin === "upload" ? "UPLOAD" : "JSON"}</Chip>
            </div>
            <span className={s.small}>
              {src.window} · {src.starts} – {src.ends} · read {when(src.fetchedAt ?? src.importedAt)} · imported {when(src.importedAt)}
            </span>
            {src.url && <a className={s.link} href={src.url} target="_blank" rel="noreferrer">{src.url.slice(0, 90)}</a>}
            {src.stats.exams !== undefined && (
              <span className={s.small}>
                {src.stats.exams} exams · {src.stats.coursesMatched}/{src.stats.courses} courses matched · {src.stats.studentsInSheet ?? 0} students listed · {src.stats.usersMatched ?? 0} Press F students by ID ({src.stats.seatsKept ?? 0} seats) ·{" "}
                {src.stats.changes ?? 0} changes, {src.stats.notified ?? 0} notified
              </span>
            )}
            {!!src.stats.unmatched?.length && <span className={s.small}>Not in the LMS: {src.stats.unmatched.join(", ")}</span>}
            {!!src.layout.length && <span className={s.small}>Layout: {src.layout.join(" · ")}</span>}
            {src.error && <span className={s.error}>{src.error}</span>}
            {!!src.problems.length && (
              <details>
                <summary className={s.small}>{src.problems.length} lines not placed</summary>
                <ul className={s.small}>{src.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </details>
            )}
            <div className={s.hstack} style={{ gap: 12 }}>
              {src.url && src.origin === "sheet" && <Btn disabled={pending} onClick={() => go(() => refreshExamSource(src.id))}>Refresh now</Btn>}
              <Btn tone="danger" disabled={pending} onClick={() => go(() => deleteExamSource(src.id), "Removed")}>Remove</Btn>
            </div>
          </div>
        ))}
      </section>
    </section>
  );
}
