import Link from "next/link";
import type { overview } from "@/server/admin/views";
import { Chip, Head, Key, KV, Label, cx, s } from "./ui";

export type OverviewData = Awaited<ReturnType<typeof overview>>;

/** A1 Overview: what needs a human now, then system health. Tiles link to their queues. */
export function Overview({ data, canSystem }: { data: OverviewData; canSystem: boolean }) {
  const k = data.kpis;
  return (
    <section className={s.main}>
      <Head title={data.greeting} sub={`${data.date} · ${data.needsText}`} />
      <div className={s.kpis}>
        <Tile href="/admin/uploads" tint={s.tintMustard} value={k.uploads.value} label="uploads waiting" sub={k.uploads.sub} />
        <Tile href="/admin/reports" tint={s.tintRust} value={k.reports.value} label="reports open" sub={k.reports.sub} />
        <Tile href={canSystem ? "/admin/people" : undefined} value={k.students.value} label="students today" sub={k.students.sub} />
        <Tile href={canSystem ? "/admin/system" : undefined} tint={s.tintMoss} value={k.sync.value} label="since LMS sync" sub={k.sync.sub} />
      </div>
      <div className={s.row2}>
        <section className={s.card} style={{ flex: "1 0 0" }} aria-label="Needs you">
          <div className={s.hstack} style={{ paddingBottom: 8 }}>
            <h2 className={s.h3} style={{ flex: 1 }}>Needs you</h2>
            <Link href="/admin/uploads" className={s.link}>Open queue</Link>
            <Key>U</Key>
          </div>
          {data.rows.length === 0 && <p className={s.small}>Nothing waiting. Uploads and reports show up here.</p>}
          {data.rows.map((r) => (
            <Link key={r.href} href={r.href} className={cx(s.tr, s.trPlain, s.trLink)}>
              <span className={cx(s.td, s.tdChip)} style={{ width: 70 }}>
                <Chip tone={r.kind === "upload" ? "mustard" : "rust"}>{r.kind === "upload" ? "Upload" : "Report"}</Chip>
              </span>
              <span className={cx(s.td, s.tdStrong)} style={{ width: 230 }}>{r.title}</span>
              <span className={cx(s.td, s.tdGrow)}>{r.meta}</span>
              <span className={s.td} style={{ width: 36, overflow: "visible" }}>{r.age}</span>
            </Link>
          ))}
        </section>
        <section className={s.card} style={{ width: 380, flexShrink: 0 }} aria-label="Health">
          <h2 className={s.h3}>Health</h2>
          {data.health.map((h) => (
            <KV key={h.label} k={h.label} tone={h.danger ? "danger" : undefined}>{h.value}</KV>
          ))}
        </section>
      </div>
      <section className={s.cardSoft} aria-label="Shared in Telegram">
        <Label>SHARED IN TELEGRAM</Label>
        <div style={{ fontSize: 14, fontWeight: 500 }}>
          {data.shares.total === "0"
            ? "No shares yet. They count when someone sends a Press F card from the bot's inline mode."
            : [`${data.shares.total} shares · ${data.shares.week} this week`, ...data.shares.byKind.map((k) => `${k.total} ${k.label}`)].join(" · ")}
        </div>
        {data.shares.top.length > 0 && (
          <div className={s.small}>
            Most shared:{" "}
            {data.shares.top.map((t, i) => (
              <span key={t.href}>
                {i > 0 ? ", " : ""}
                <Link href={t.href} className={s.link} prefetch={false}>{t.label}</Link> ({t.n})
              </span>
            ))}
          </div>
        )}
      </section>
      <section className={s.cardSoft}>
        <Label>THIS WEEK</Label>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{data.week}</div>
      </section>
    </section>
  );
}

function Tile({ href, tint, value, label, sub }: { href?: string; tint?: string; value: string; label: string; sub: string }) {
  const body = (
    <>
      <span className={s.kpiValue}>{value}</span>
      <span className={s.kpiLabel}>{label}</span>
      <span className={s.kpiSub}>{sub}</span>
    </>
  );
  return href ? <Link href={href} className={cx(s.card, s.kpi, tint)}>{body}</Link> : <div className={cx(s.card, s.kpi, tint)}>{body}</div>;
}
