"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { resolveReport } from "@/app/admin/actions";
import type { reportsPage } from "@/server/admin/views";
import { Btn, Head, Label, cx, s } from "./ui";
import { AdminToast, type Note } from "./Toast";
import { useKeys } from "./useKeys";
import type { SortColumns } from "@/core/sort";
import { SortHeader, useSortedRows } from "@/ui/table/Sort";

export type ReportsData = Awaited<ReturnType<typeof reportsPage>>;
type Outcome = "hide" | "mute" | "keep";
const COLUMNS: SortColumns<ReportsData["items"][number], "title" | "reports" | "age"> = {
  title: (i) => i.title.replace(/^'/, ""),
  reports: (i) => i.total,
  // Youngest first.
  age: (i) => (i.at == null ? null : -i.at),
};
const DONE: Record<Outcome, string> = { hide: "Hidden", mute: "Hidden · author muted 7 days", keep: "Kept" };

/** A4 Reports: one queue for Anonymous posts and student files. H hide, M hide + mute 7 days, K keep. */
export function Reports({ data }: { data: ReportsData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [items, drop] = useOptimistic(data.items, (state, key: string) => state.filter((i) => i.key !== key));
  const sorted = useSortedRows(items, COLUMNS);
  const list = sorted.rows;
  const [selKey, setSelKey] = useState(data.selectedKey);
  const [toast, setToast] = useState<Note>(null);

  const index = Math.max(0, list.findIndex((i) => i.key === selKey));
  const sel = list[index] ?? null;
  const open = data.tab === "open";

  const pick = (n: number) => {
    const next = list[Math.min(Math.max(n, 0), list.length - 1)];
    if (!next) return;
    setSelKey(next.key);
    window.history.replaceState(null, "", `?tab=${data.tab}&item=${next.key}`);
  };

  const act = (outcome: Outcome) => {
    if (!sel || !open || pending) return;
    if (outcome === "mute" && sel.kind !== "post") return;
    const rest = list.filter((i) => i.key !== sel.key);
    setSelKey(rest[Math.min(index, rest.length - 1)]?.key ?? null);
    start(async () => {
      drop(sel.key);
      const r = await resolveReport(sel.kind, sel.id, outcome);
      if (!r.ok) {
        setToast({ text: r.error, error: true });
        setSelKey(sel.key);
        router.refresh();
      } else setToast(DONE[outcome]);
    });
  };

  useKeys({ h: () => act("hide"), m: () => act("mute"), k: () => act("keep"), ArrowDown: () => pick(index + 1), ArrowUp: () => pick(index - 1) });

  return (
    <>
      <section className={cx(s.main, s.mainFixed)} style={{ width: 520 }}>
        <Head title="Reports" sub="From the ⋯ menu on Anonymous posts and student files" />
        <div className={s.tabs}>
          <Link href="/admin/reports" className={cx(s.chip, open && s.chipInverse)}>Open {open ? items.length : data.counts.open}</Link>
          <Link href="/admin/reports?tab=resolved" className={cx(s.chip, !open && s.chipInverse)}>Resolved {data.counts.resolved}</Link>
          <Link href="/admin/reports?tab=links" className={s.chip}>Links</Link>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.length === 0 && <p className={s.small}>{open ? "No open reports. Nice." : "Nothing resolved yet."}</p>}
          {items.length > 1 && (
            <div className={cx(s.tr, s.trHead)} role="row">
              <SortHeader state={sorted.state} k="title" className={cx(s.td, s.tdGrow)}>ITEM</SortHeader>
              <SortHeader state={sorted.state} k="reports" className={s.td} style={{ width: 80 }}>REPORTS</SortHeader>
              <SortHeader state={sorted.state} k="age" className={s.td} style={{ width: 60 }}>AGE</SortHeader>
            </div>
          )}
          {list.map((i, n) => (
            <button key={i.key} type="button" className={cx(s.listCard, n === index && s.listCardActive)} onClick={() => pick(n)} aria-current={n === index}>
              <span className={s.listTitle}>{i.title}</span>
              <span className={s.listMeta}>{i.meta}{i.outcome ? ` · ${i.outcome}` : ""}</span>
            </button>
          ))}
        </div>
      </section>
      {sel && (
        <section className={s.detail} aria-label="Report">
          <Label>{sel.context}</Label>
          <div className={s.card} style={{ gap: 8 }}>
            <div style={{ fontSize: 18, lineHeight: 1.4, whiteSpace: "pre-line" }}>{sel.body}</div>
            {sel.url && (
              <a className={s.small} href={sel.url} target="_blank" rel="noreferrer">{sel.kind === "post" ? "Open the post" : "Open the file"} ↗</a>
            )}
          </div>
          <div className={s.cardSoft}>
            <Label>REPORTED AS</Label>
            {sel.reasons.map((r) => (
              <div key={r.label} style={{ fontSize: 14, fontWeight: 500 }}>{r.label} · {r.count}</div>
            ))}
          </div>
          <div className={cx(s.cardSoft, s.tintMustard)}>
            <div className={s.warmText}>{sel.rule}</div>
          </div>
          {sel.kind === "post" && (
            <p className={s.note} style={{ margin: 0 }}>Author: hidden from admins too. Mute acts on the post&apos;s private author token — we never learn who it is.</p>
          )}
          <div className={s.spacer} />
          {open && (
            <div className={s.actions}>
              <Btn tone="danger" hint="H" onClick={() => act("hide")} disabled={pending}>{sel.kind === "post" ? "Hide post" : "Hide file"}</Btn>
              {sel.kind === "post" && <Btn hint="M" onClick={() => act("mute")} disabled={pending}>Hide + mute author 7 days</Btn>}
              <Btn hint="K" onClick={() => act("keep")} disabled={pending}>Keep</Btn>
            </div>
          )}
        </section>
      )}
      <AdminToast note={toast} />
    </>
  );
}
