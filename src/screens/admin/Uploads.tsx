"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { TYPE_LABEL, type FileType } from "@/core/files";
import { REJECT_REASONS, rejectMessage, UPLOAD_TYPES, type RejectReason } from "@/core/uploads";
import { EmptyState } from "@/ui/components";
import { hideLiveUpload, publishUpload, rejectUpload } from "@/app/admin/actions";
import type { uploadsPage } from "@/server/admin/views";
import { Btn, Chip, Head, KV, Label, Radio, cx, s } from "./ui";
import { AdminToast, type Note } from "./Toast";
import { useKeys } from "./useKeys";
import { sortEntries } from "@/core/sort";
import { UrlSortHead } from "@/ui/table/Sort";

type View = Awaited<ReturnType<typeof uploadsPage>>;
type Item = Omit<View["items"][number], "storageKey"> & { previewUrl: string | null };
export type UploadsData = Omit<View, "items"> & { items: Item[] };
type Edits = { title?: string; type?: string; courseId?: string; week?: number | null; exam?: string | null };

const TAB_LABEL = { waiting: "Waiting", live: "Live", rejected: "Not accepted" } as const;
const REASONS = Object.entries(REJECT_REASONS) as Array<[RejectReason, (typeof REJECT_REASONS)[RejectReason]]>;
const EXAMS = ["midterm", "final", "quiz"];
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const mb = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

/** A2 Uploads · review (+ A3 not-accept dialog, A11 all clear). J/K move, A publishes, R opens reasons. */
export function Uploads({ data }: { data: UploadsData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [items, drop] = useOptimistic(data.items, (state, id: string) => state.filter((i) => i.id !== id));
  const [selId, setSelId] = useState(data.selectedId);
  const [edits, setEdits] = useState<Record<string, Edits>>({});
  const [dialog, setDialog] = useState(false);
  const [toast, setToast] = useState<Note>(null);
  const counts = { ...data.counts, [data.tab]: Math.max(0, data.counts[data.tab] - (data.items.length - items.length)) };

  const index = Math.max(0, items.findIndex((i) => i.id === selId));
  const sel = items[index] ?? null;
  const e = (sel && edits[sel.id]) ?? {};
  const course = data.courseOptions.find((c) => c.id === (e.courseId ?? sel?.courseId));
  const week = e.week !== undefined ? e.week : sel?.week ?? null;


  const select = (i: number) => {
    const next = items[Math.min(Math.max(i, 0), items.length - 1)];
    if (!next) return;
    setSelId(next.id);
    window.history.replaceState(null, "", `?${new URLSearchParams({ tab: data.tab, ...sortEntries(data.sort), id: next.id })}`);
  };

  const after = (id: string) => {
    const rest = items.filter((i) => i.id !== id);
    setSelId(rest[Math.min(index, rest.length - 1)]?.id ?? null);
  };

  const act = (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    after(id);
    start(async () => {
      drop(id);
      const r = await fn();
      if (!r.ok) {
        setToast({ text: r.error ?? "Failed", error: true });
        setSelId(id);
        router.refresh();
      } else setToast(done);
    });
  };

  const publish = () => {
    if (!sel || pending) return;
    const patch: Edits = {};
    if (e.title !== undefined && e.title.trim() && e.title !== sel.title) patch.title = e.title.trim();
    if (e.type && e.type !== sel.type) patch.type = e.type;
    if (e.courseId && e.courseId !== sel.courseId) patch.courseId = e.courseId;
    if (e.week !== undefined && e.week !== sel.week) patch.week = e.week;
    if (e.exam !== undefined && e.exam !== sel.exam) patch.exam = e.exam;
    const p = { ...patch, ...(patch.courseId ? { courseCode: course?.code ?? null } : {}) };
    act(sel.id, () => publishUpload(sel.id, p), `Published · ${sel.title}`);
  };

  const hide = () => sel && act(sel.id, () => hideLiveUpload(sel.id), `Hidden · ${sel.title}`);

  useKeys(
    {
      j: () => select(index + 1),
      k: () => select(index - 1),
      a: () => data.tab !== "live" && publish(),
      r: () => data.tab === "waiting" && sel && setDialog(true),
    },
    !dialog
  );

  const setEdit = (patch: Edits) => sel && setEdits((all) => ({ ...all, [sel.id]: { ...all[sel.id], ...patch } }));

  return (
    <>
      <section className={cx(s.column, s.columnPage)} style={{ width: 340, gap: items.length === 0 ? 12 : undefined }} aria-label="Queue">
        <Head title="Uploads" />
        <div className={s.tabs}>
          {(Object.keys(TAB_LABEL) as Array<keyof typeof TAB_LABEL>).map((t) => (
            <Link key={t} href={`/admin/uploads?${new URLSearchParams({ tab: t, ...sortEntries(data.sort) })}`} className={cx(s.chip, t === data.tab && s.chipInverse)} prefetch>
              {TAB_LABEL[t]} {counts[t]}
            </Link>
          ))}
        </div>
        {items.length === 0 ? (
          <AllClear tab={data.tab} />
        ) : (
          <>
            {items.length > 1 && (
              <UrlSortHead
                className={cx(s.tr, s.trHead)}
                sort={data.sort}
                columns={[
                  { key: "title", label: "FILE", className: cx(s.td, s.tdGrow) },
                  { key: "course", label: "COURSE", className: s.td, style: { width: 72 } },
                  { key: "type", label: "TYPE", className: s.td, style: { width: 52 } },
                  { key: "age", label: "AGE", className: s.td, style: { width: 44 } },
                ]}
              />
            )}
            {items.map((i, n) => (
              <button key={i.id} type="button" className={cx(s.queueItem, n === index && s.queueItemActive)} onClick={() => select(n)} aria-current={n === index}>
                <span className={s.queueTitle}>
                  <span>{i.title}</span>
                  {i.flag === "lms" && <Chip tone="rust">In LMS?</Chip>}
                  {i.flag === "check" && <Chip tone="mustard">Check</Chip>}
                </span>
                <span className={s.queueMeta}>
                  {[i.courseName, i.typeLabel, i.age, i.trust === "trusted" ? "trusted" : i.uploader.live === 0 && i.uploader.rejected === 0 ? "new" : null].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
            <div className={s.hstack} style={{ gap: 6 }}>
              <kbd className={s.key}>J</kbd>
              <kbd className={s.key}>K</kbd>
              <span className={s.note}>next / previous</span>
            </div>
          </>
        )}
      </section>

      {sel && (
        <>
          <section className={s.preview} aria-label="Preview">
            <div className={s.previewBar}>
              <span>{sel.fileName} · {mb(sel.size)}</span>
              {sel.previewUrl && <a className={s.link} href={sel.previewUrl} target="_blank" rel="noreferrer">Open</a>}
            </div>
            <Preview item={sel} />
          </section>

          <aside className={s.inspector} style={{ width: 400, flexShrink: 0 }} aria-label="Details">
            <input
              className={s.h2}
              style={{ border: 0, background: "none", padding: 0, color: "var(--text-primary)", width: "100%" }}
              aria-label="Title"
              value={e.title ?? sel.title}
              onChange={(ev) => setEdit({ title: ev.target.value })}
            />
            <div className={cx(s.cardSoft, sel.checks.every((c) => c.ok) ? s.tintMoss : s.tintMustard)}>
              <Label>AUTOMATIC CHECKS</Label>
              {sel.checks.length === 0 && <div style={{ fontSize: 13, fontWeight: 500 }}>No automatic checks ran for this file</div>}
              {sel.checks.map((c) => (
                <div key={c.text} style={{ fontSize: 13, fontWeight: 500 }}>{c.ok ? "✓" : "⚠"} {c.text}</div>
              ))}
            </div>
            <div className={s.cardSoft} style={{ gap: 8 }}>
              <Label>DETAILS · editable</Label>
              <KV k="Course">
                <select className={s.select} value={e.courseId ?? sel.courseId} onChange={(ev) => setEdit({ courseId: ev.target.value })}>
                  {data.courseOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.code ? ` · ${c.code}` : ""}  ▾</option>
                  ))}
                </select>
              </KV>
              <KV k="Type">
                <select className={s.select} value={e.type ?? sel.type} onChange={(ev) => setEdit({ type: ev.target.value })}>
                  {UPLOAD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t as FileType]}  ▾</option>)}
                </select>
              </KV>
              <KV k="Exam">
                <select className={s.select} value={(e.exam !== undefined ? e.exam : sel.exam) ?? ""} onChange={(ev) => setEdit({ exam: ev.target.value || null })}>
                  <option value="">—  ▾</option>
                  {EXAMS.map((x) => <option key={x} value={x}>{cap(x)}{sel.term ? ` · ${sel.term}` : ""}  ▾</option>)}
                </select>
              </KV>
              <KV k="Week">
                <select className={s.select} value={week ?? ""} onChange={(ev) => setEdit({ week: ev.target.value ? Number(ev.target.value) : null })}>
                  <option value="">No week  ▾</option>
                  {Array.from({ length: 16 }, (_, n) => n + 1).map((w) => <option key={w} value={w}>Week {w}{w === 8 ? " (midterms)" : ""}  ▾</option>)}
                </select>
              </KV>
              <KV k="Shown as">{sel.shownAs}</KV>
            </div>
            <div className={s.cardSoft}>
              <Label>UPLOADER</Label>
              <KV k="Student">{sel.uploader.label}</KV>
              <KV k="History">{sel.uploader.live} live · {sel.uploader.rejected} not accepted</KV>
              <KV k="Trust" tone="accent" top>
                {sel.trust === "trusted" ? "Trusted — next uploads go live at once" : sel.trust === "paused" ? "Paused — sharing is off" : "Normal — every upload waits for review"}
              </KV>
            </div>
            <div className={s.spacer} />
            {data.tab === "live" ? (
              <div className={s.actions}>
                <Btn tone="danger" onClick={hide} disabled={pending} grow>Hide from students</Btn>
              </div>
            ) : (
              <div className={s.actions}>
                <Btn tone="accent" grow hint="A" onClick={publish} disabled={pending}>{data.tab === "rejected" ? "Publish anyway" : "Publish"}</Btn>
                {data.tab === "waiting" && <Btn hint="R" onClick={() => setDialog(true)} disabled={pending}>Not accept</Btn>}
              </div>
            )}
            <p className={s.small} style={{ margin: 0 }}>
              {data.tab === "live"
                ? "Hidden files vanish for students but stay in history."
                : `Publishing tells the uploader in the bot and adds it to ${course?.name ?? sel.courseName}${week ? ` → Week ${week}` : ""}.`}
            </p>
          </aside>
        </>
      )}

      {dialog && sel && (
        <RejectDialog
          title={e.title ?? sel.title}
          courseName={course?.name ?? sel.courseName}
          onCancel={() => setDialog(false)}
          onSubmit={(reason, note) => {
            setDialog(false);
            act(sel.id, () => rejectUpload(sel.id, reason, note), `Not accepted · ${sel.title}`);
          }}
        />
      )}
      <AdminToast note={toast} />
    </>
  );
}

function Preview({ item }: { item: Item }) {
  if (!item.previewUrl) {
    return (
      <div className={s.docPage}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{item.fileName}</div>
        <div style={{ fontSize: 13 }}>The file isn&apos;t in storage yet — the bot is still copying it.</div>
      </div>
    );
  }
  if (item.mimeType.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
    return <img className={s.docImage} src={item.previewUrl} alt={item.title} />;
  }
  if (item.mimeType === "application/pdf") return <iframe key={item.id} className={s.docFrame} src={item.previewUrl} title={item.fileName} />;
  return (
    <div className={s.docPage}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{item.fileName}</div>
      <div style={{ fontSize: 13 }}>No inline preview for this format.</div>
      <a className={s.link} href={item.previewUrl} target="_blank" rel="noreferrer">Download to check</a>
    </div>
  );
}

function AllClear({ tab }: { tab: keyof typeof TAB_LABEL }) {
  return tab === "waiting" ? (
    <EmptyState title="All clear" text="No uploads waiting. Trusted uploads still go live — spot-check them in Live." />
  ) : (
    <EmptyState title="Nothing here" text={tab === "live" ? "No student files are live yet." : "Nothing has been turned down."} />
  );
}

function RejectDialog({ title, courseName, onCancel, onSubmit }: { title: string; courseName: string; onCancel: () => void; onSubmit: (r: RejectReason, note: string) => void }) {
  const [reason, setReason] = useState<RejectReason>("in-lms");
  const [note, setNote] = useState("");
  const message = useMemo(() => rejectMessage(title, courseName, reason, note), [title, courseName, reason, note]);
  const ready = reason !== "other" || note.trim().length > 0;
  useKeys({
    Escape: onCancel,
    Enter: () => ready && onSubmit(reason, note),
    "mod+Enter": () => ready && onSubmit(reason, note),
    ...Object.fromEntries(REASONS.map(([r], n) => [String(n + 1), () => setReason(r)])),
  });
  return (
    <div className={s.scrim} onClick={onCancel}>
      <div className={s.dialog} role="dialog" aria-modal aria-labelledby="why-title" onClick={(ev) => ev.stopPropagation()}>
        <h2 id="why-title" className={s.dialogTitle}>Why not this one?</h2>
        <div className={s.dialogSub}>{title} · {courseName}</div>
        {REASONS.map(([r, def], n) => (
          <button key={r} type="button" className={cx(s.option, reason === r && s.optionActive)} onClick={() => setReason(r)} aria-pressed={reason === r}>
            <Radio on={reason === r} />
            <span className={s.optionText}>{def.label}</span>
            <kbd className={s.key}>{n + 1}</kbd>
          </button>
        ))}
        {reason === "other" && (
          <textarea className={s.message} style={{ fontSize: 13, minHeight: 60 }} autoFocus placeholder="A short note for the student" value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={500} />
        )}
        <div className={cx(s.cardSoft, s.tintSunken)} style={{ gap: 4 }}>
          <Label>THE STUDENT GETS IN THE BOT</Label>
          <div className={s.botText}>{message}</div>
        </div>
        <div className={s.actions} style={{ justifyContent: "flex-end" }}>
          <Btn hint="Esc" onClick={onCancel}>Cancel</Btn>
          <Btn tone="danger" hint="↵" disabled={!ready} onClick={() => onSubmit(reason, note)}>Not accept</Btn>
        </div>
      </div>
    </div>
  );
}
