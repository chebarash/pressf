"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markNotTwins, mergeTeachers } from "@/app/admin/actions";
import type { professorsPage } from "@/server/admin/views";
import { Btn, Chip, Head, KV, Label, cx, s } from "./ui";
import { useKeys } from "./useKeys";

export type ProfessorsData = Awaited<ReturnType<typeof professorsPage>>;
type Card = NonNullable<ProfessorsData["selected"]>["keep"];

const stats = (c: Card) => `LMS ${c.id} · ${c.courses} course${c.courses === 1 ? "" : "s"} · ${c.ratings} ratings · ${c.posts} posts`;

/** A6 Professors · merge: LMS spelling changes create twins. ↵ merges, N says they're different people. */
export function Professors({ data }: { data: ProfessorsData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [flip, setFlip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sel = data.selected;
  const keep = sel && (flip ? sel.merge : sel.keep);
  const merge = sel && (flip ? sel.keep : sel.merge);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Failed");
      else {
        setFlip(false);
        router.replace("/admin/professors");
      }
    });
  const doMerge = () => keep && merge && !pending && run(() => mergeTeachers(keep.id, merge.id));
  const notSame = () => keep && merge && !pending && run(() => markNotTwins(keep.id, merge.id));
  useKeys({ Enter: () => doMerge(), n: () => notSame() }, data.tab === "duplicates");

  return (
    <>
      <section className={cx(s.main, s.mainFixed)} style={{ width: 560 }}>
        <Head title="Professors" sub={`${data.total} · ${data.duplicates.length} possible duplicate${data.duplicates.length === 1 ? "" : "s"}`} />
        <div className={s.tabs}>
          <Link href="/admin/professors" className={cx(s.chip, data.tab === "duplicates" && s.chipInverse)}>Duplicates {data.duplicates.length}</Link>
          <Link href="/admin/professors?tab=all" className={cx(s.chip, data.tab === "all" && s.chipInverse)}>All {data.total}</Link>
          <Link href="/admin/professors?tab=faces" className={s.chip}>Faces</Link>
          <Link href="/admin/professors?tab=profile" className={s.chip}>Profile</Link>
          <Link href="/admin/professors?tab=newuu" className={s.chip}>Unmatched from newuu.uz</Link>
          <span className={s.chip}>No LMS link {data.orphans}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {data.tab === "duplicates" && data.duplicates.length === 0 && <p className={s.small}>No twins found. New spellings from the LMS show up here.</p>}
          {data.tab === "duplicates" &&
            data.duplicates.map((d) => (
              <Link key={d.key} href={`/admin/professors?pair=${d.key}`} className={cx(s.listCard, sel?.key === d.key && s.listCardActive)} onClick={() => setFlip(false)}>
                <span className={s.listTitle}>{d.keep.name}{"\u00a0 ↔ \u00a0"}{d.merge.name}</span>
                <span className={s.listMeta}>{d.why}</span>
              </Link>
            ))}
          {data.tab === "all" && (
            <div className={cx(s.card, s.table)}>
              <div className={cx(s.tr, s.trHead)}>
                <span className={cx(s.td, s.tdGrow)}>NAME</span>
                <span className={s.td} style={{ width: 70 }}>COURSES</span>
                <span className={s.td} style={{ width: 70 }}>RATINGS</span>
              </div>
              {data.all.map((t) => (
                <div key={t.id} className={s.tr}>
                  <Link href={`/p/${t.id}`} className={cx(s.td, s.tdGrow, s.tdStrong, s.trLink)}>{t.name}</Link>
                  <span className={s.td} style={{ width: 70 }}>{t.courses}</span>
                  <span className={s.td} style={{ width: 70 }}>{t.ratings}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      {data.tab === "duplicates" && keep && merge && sel && (
        <section className={cx(s.detail, s.detailNarrow)} aria-label="Merge">
          <h2 className={s.h2}>Merge into one page</h2>
          <div className={s.row2} style={{ gap: 12 }}>
            <button type="button" className={cx(s.card, s.tintMoss)} style={{ flex: "1 0 0", textAlign: "left", cursor: "default", gap: 6 }}>
              <span><Chip tone="moss">KEEP</Chip></span>
              <span className={s.cardName}>{keep.name}</span>
              <span className={s.small}>{stats(keep)}</span>
            </button>
            <button type="button" className={s.cardSoft} style={{ flex: "1 0 0", textAlign: "left", cursor: "pointer" }} onClick={() => setFlip((f) => !f)} title="Keep this one instead">
              <span><Chip>MERGE IN</Chip></span>
              <span className={s.cardName}>{merge.name}</span>
              <span className={s.small}>{stats(merge)}</span>
            </button>
          </div>
          <div className={s.cardSoft}>
            <Label>AFTER MERGE</Label>
            <KV k="Name" wide>{keep.name}</KV>
            <KV k="Ratings" wide>{sel.after.ratings} {sel.after.doubles ? `(no double votes: ${sel.after.doubles} student${sel.after.doubles === 1 ? "" : "s"} rated both — newest kept)` : "(no double votes)"}</KV>
            <KV k="Old link" wide>/p/{merge.id} → redirects</KV>
          </div>
          {error && <div className={s.error}>{error}</div>}
          <div className={s.spacer} />
          <div className={s.actions}>
            <Btn tone="accent" hint="↵" onClick={doMerge} disabled={pending}>Merge</Btn>
            <Btn hint="N" onClick={notSame} disabled={pending}>Not the same person</Btn>
          </div>
        </section>
      )}
      {data.tab === "all" && <section className={cx(s.detail, s.detailNarrow)} />}
    </>
  );
}
