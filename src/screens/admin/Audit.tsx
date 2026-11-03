"use client";

import { useRouter } from "next/navigation";
import type { auditPage } from "@/server/admin/views";
import { Head, cx, s } from "./ui";
import { sortEntries } from "@/core/sort";
import { UrlSortHead } from "@/ui/table/Sort";

export type AuditData = Awaited<ReturnType<typeof auditPage>>;

/** A9 Audit log: who did what, filterable by person and action. Exports CSV. Read-only. */
export function Audit({ data }: { data: AuditData }) {
  const router = useRouter();
  const go = (patch: { actor?: string; action?: string }) => {
    const next = { ...data.filter, ...patch, ...sortEntries(data.sort) };
    const q = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as Array<[string, string]>);
    router.replace(`/admin/audit${q.size ? `?${q}` : ""}`);
  };
  const csv = new URLSearchParams(Object.entries(data.filter).filter(([, v]) => v) as Array<[string, string]>);
  return (
    <section className={s.main}>
      <Head title="Audit log" sub="Every admin and moderator action. Kept 1 year. Read-only." />
      <div className={s.hstack}>
        <select className={s.chip} value={data.filter.actor ?? ""} onChange={(e) => go({ actor: e.target.value })} aria-label="Person">
          <option value="">Everyone</option>
          {data.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className={s.chip} value={data.filter.action ?? ""} onChange={(e) => go({ action: e.target.value })} aria-label="Action">
          <option value="">All actions</option>
          {data.actions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <div className={s.spacer} />
        <a className={s.link} href={`/admin/audit/export${csv.size ? `?${csv}` : ""}`} download>Export CSV</a>
      </div>
      <div className={cx(s.card, s.table)}>
        <UrlSortHead
          className={cx(s.tr, s.trHead)}
          sort={data.sort}
          columns={[
            { key: "when", label: "WHEN", className: s.td, style: { width: 110 } },
            { key: "who", label: "WHO", className: s.td, style: { width: 160 } },
            { key: "action", label: "ACTION", className: s.td, style: { width: 180 } },
            { key: null, label: "WHAT", className: cx(s.td, s.tdGrow) },
          ]}
        />
        {data.rows.length === 0 && <p className={s.small} style={{ padding: 12 }}>Nothing logged yet.</p>}
        {data.rows.map((r) => (
          <div key={r.id} className={s.tr}>
            <span className={s.td} style={{ width: 110 }} title={r.at}>{r.when}</span>
            <span className={s.td} style={{ width: 160 }}>{r.who}</span>
            <span className={cx(s.td, s.tdStrong)} style={{ width: 180 }}>{r.action}</span>
            <span className={cx(s.td, s.tdGrow)}>{r.what}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
