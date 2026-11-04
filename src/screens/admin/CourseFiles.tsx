"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { TYPE_LABEL, type FileType } from "@/core/files";
import { bulkFiles, editFile } from "@/app/admin/actions";
import type { courseFiles } from "@/server/admin/views";
import { Btn, Chip, Head, cx, s } from "./ui";
import { AdminToast, type Note } from "./Toast";
import { useKeys } from "./useKeys";
import type { SortColumns } from "@/core/sort";
import { SortHeader, useSortedRows } from "@/ui/table/Sort";

export type CourseFilesData = NonNullable<Awaited<ReturnType<typeof courseFiles>>>;
type File = CourseFilesData["files"][number];
type Filter = "all" | "lms" | "students" | "hidden";
const TYPES = Object.keys(TYPE_LABEL) as FileType[];
const ref = (f: File) => ({ source: f.source, id: f.id });
const COLUMNS: SortColumns<File, "title" | "type" | "week" | "source" | "added" | "opens"> = {
  title: (f) => f.title, type: (f) => f.typeLabel, week: (f) => f.week, source: (f) => f.from, added: (f) => f.at, opens: (f) => f.opens,
};

/** A5 Courses & files: per-course file manager. Bulk move (W) / hide (H); rename, type and week inline. */
export function CourseFiles({ data }: { data: CourseFilesData }) {
  // Edits show at once; the server action revalidates and the fresh list replaces the guess.
  const [files, apply] = useOptimistic(data.files, (all: File[], c: { keys: string[]; p: Partial<File> }) => all.map((f) => (c.keys.includes(f.key) ? ({ ...f, ...c.p } as File) : f)));
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [weekAsk, setWeekAsk] = useState(false);
  const [toast, setToast] = useState<Note>(null);
  const [pending, start] = useTransition();

  const shown = files.filter((f) => (filter === "hidden" ? f.hidden : !f.hidden && (filter === "all" || f.source === filter)));
  const visible = files.filter((f) => !f.hidden);
  const counts = { all: visible.length, lms: visible.filter((f) => f.source === "lms").length, students: visible.filter((f) => f.source === "students").length, hidden: files.length - visible.length };
  const selected = files.filter((f) => picked.has(f.key));
  const sort = useSortedRows(shown, COLUMNS);

  const save = (f: File, p: { title?: string; type?: FileType; week?: number | null }) =>
    start(async () => {
      apply({ keys: [f.key], p: { ...p, ...(p.type ? { typeLabel: TYPE_LABEL[p.type] } : {}) } });
      const r = await editFile(ref(f), p);
      if (!r.ok) setToast({ text: r.error, error: true });
    });
  const bulk = (op: { week: number | null } | { hidden: boolean }) => {
    if (!selected.length) return;
    const keys = selected.map((f) => f.key);
    const refs = selected.map(ref);
    setPicked(new Set());
    start(async () => {
      apply({ keys, p: "week" in op ? { week: op.week } : { hidden: op.hidden } });
      const r = await bulkFiles(refs, op);
      if (!r.ok) setToast({ text: r.error, error: true });
      else setToast("week" in op ? `Moved ${keys.length} to ${op.week ? `week ${op.week}` : "no week"}` : `${op.hidden ? "Hidden" : "Shown"} ${keys.length}`);
    });
  };
  const toggle = (key: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    return n;
  });

  useKeys({ w: () => selected.length && setWeekAsk(true), h: () => bulk({ hidden: filter !== "hidden" }), Escape: () => (setWeekAsk(false), setRenaming(null)) }, !renaming);

  return (
    <section className={s.main}>
      <Head title={data.name} sub={`${data.code} · ${counts.all} file${counts.all === 1 ? "" : "s"}: ${counts.lms} from LMS, ${counts.students} from students`} />
      <div className={s.hstack} style={{ minHeight: 100 }}>
        {(["all", "lms", "students", "hidden"] as Filter[]).map((k) => (
          <button key={k} type="button" className={cx(s.chip, filter === k && s.chipInverse)} onClick={() => (setFilter(k), setPicked(new Set()))}>
            {{ all: "All", lms: "From LMS", students: "From students", hidden: "Hidden" }[k]} {counts[k]}
          </button>
        ))}
        <div className={s.spacer} />
        {selected.length > 0 && <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.length} selected</span>}
        {weekAsk ? (
          <select
            className={s.btn}
            autoFocus
            aria-label="Move to week"
            defaultValue=""
            onChange={(e) => (setWeekAsk(false), bulk({ week: e.target.value === "none" ? null : Number(e.target.value) }))}
            onBlur={() => setWeekAsk(false)}
          >
            <option value="" disabled>Move to week…</option>
            <option value="none">No week</option>
            {Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>Week {i + 1}</option>)}
          </select>
        ) : (
          <Btn hint="W" disabled={!selected.length || pending} onClick={() => setWeekAsk(true)}>Move to week</Btn>
        )}
        <Btn hint="H" disabled={!selected.length || pending} onClick={() => bulk({ hidden: filter !== "hidden" })}>{filter === "hidden" ? "Show" : "Hide"}</Btn>
      </div>
      <div className={cx(s.card, s.table)}>
        <div className={cx(s.tr, s.trHead)}>
          <span className={s.td} style={{ width: 24 }} />
          <SortHeader state={sort.state} k="title" className={cx(s.td, s.tdGrow)}>TITLE</SortHeader>
          <SortHeader state={sort.state} k="type" className={s.td} style={{ width: 110 }}>TYPE</SortHeader>
          <SortHeader state={sort.state} k="week" className={s.td} style={{ width: 90 }}>WEEK</SortHeader>
          <SortHeader state={sort.state} k="source" className={s.td} style={{ width: 200 }}>SOURCE</SortHeader>
          <SortHeader state={sort.state} k="added" className={s.td} style={{ width: 110 }}>ADDED</SortHeader>
          <SortHeader state={sort.state} k="opens" className={s.td} style={{ width: 90 }}>OPENS</SortHeader>
        </div>
        {shown.length === 0 && <p className={s.small} style={{ padding: 12 }}>No files here.</p>}
        {sort.rows.map((f) => {
          const on = picked.has(f.key);
          return (
            <div key={f.key} className={cx(s.tr, on && s.trSelected)}>
              <span className={s.td} style={{ width: 24, display: "flex" }}>
                <button type="button" className={cx(s.check, on && s.checkOn)} role="checkbox" aria-checked={on} aria-label={`Select ${f.title}`} onClick={() => toggle(f.key)} />
              </span>
              <span className={cx(s.td, s.tdGrow, s.tdStrong)} onDoubleClick={() => setRenaming(f.key)} title="Double-click to rename">
                {renaming === f.key ? (
                  <input
                    className={s.inputInline}
                    style={{ width: "100%" }}
                    autoFocus
                    defaultValue={f.title}
                    aria-label="Rename"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = e.currentTarget.value.trim();
                        setRenaming(null);
                        if (v && v !== f.title) save(f, { title: v });
                      }
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onBlur={(e) => {
                      const v = e.currentTarget.value.trim();
                      setRenaming(null);
                      if (v && v !== f.title) save(f, { title: v });
                    }}
                  />
                ) : (
                  f.title
                )}
              </span>
              <span className={s.td} style={{ width: 110 }}>
                <select className={s.select} style={{ fontWeight: 400, color: "var(--text-secondary)" }} value={f.type} aria-label="Type" onChange={(e) => save(f, { type: e.target.value as FileType })}>
                  {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </span>
              <span className={s.td} style={{ width: 90 }}>
                <select className={s.select} style={{ fontWeight: 400, color: "var(--text-secondary)" }} value={f.week ?? ""} aria-label="Week" onChange={(e) => save(f, { week: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">—</option>
                  {Array.from({ length: 16 }, (_, i) => <option key={i} value={i + 1}>Week {i + 1}</option>)}
                </select>
              </span>
              <span className={cx(s.td, s.tdChip)} style={{ width: 200 }}>{f.fromStudents ? <Chip tone="plum">{f.from}</Chip> : f.from}</span>
              <span className={s.td} style={{ width: 110 }}>{f.added}</span>
              <span className={s.td} style={{ width: 90 }}>{f.opens == null ? "—" : f.opens.toLocaleString("en-US")}</span>
            </div>
          );
        })}
      </div>
      <p className={s.note} style={{ margin: 0 }}>Rename, change type or week inline. Hidden files vanish for students but stay in history. LMS files re-sync but keep your edits.</p>
      <AdminToast note={toast} />
    </section>
  );
}
