"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { assignNewuuPerson, dismissNewuuPerson, importNewuu, type Result } from "@/app/admin/actions";
import type { unmatchedPage } from "@/server/admin/profiles";
import { ProfessorTabs } from "./ProfessorProfiles";
import { Btn, Head, KV, Label, cx, s } from "./ui";

export type UnmatchedData = Awaited<ReturnType<typeof unmatchedPage>>;

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" });

/**
 * A6 Professors · Unmatched from newuu.uz: faculty-site people the name matcher
 * could not link for sure. One click links a person to a professor (kept across
 * imports) or dismisses them. Also starts an import and shows the last summary.
 */
export function NewuuUnmatched({ data, canEdit }: { data: UnmatchedData; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const sel = data.selected;
  const href = (siteId: number) => `/admin/professors?tab=newuu&person=${siteId}`;

  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      setNote(r.ok ? { ok: true, text: r.message ?? "Done" } : { ok: false, text: r.error });
      router.refresh();
    });
  const last = data.last;

  return (
    <>
      <section className={cx(s.main, s.mainFixed)} style={{ width: 520 }}>
        <Head title="Professors" sub={`${data.people.length} from newuu.uz without a professor`} />
        <ProfessorTabs active="newuu" />
        <div className={s.cardSoft}>
          <Label>LAST IMPORT</Label>
          {last ? (
            <>
              <span className={s.small}>
                {when(last.at)} · {last.matched} matched · {last.updated} updated · {last.unmatched} unmatched · {last.people} people
              </span>
              {last.failed > 0 && <span className={s.error}>{last.error ?? `${last.failed} request${last.failed === 1 ? "" : "s"} failed`} — previous data kept</span>}
            </>
          ) : (
            <span className={s.small}>Never imported. The weekly harvest also runs it.</span>
          )}
          {canEdit && (
            <div className={s.actions}>
              <Btn onClick={() => !pending && run(importNewuu)} disabled={pending}>Import from newuu.uz now</Btn>
            </div>
          )}
        </div>
        {note && <div className={note.ok ? s.small : s.error}>{note.text}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.people.length === 0 && <p className={s.small}>Everyone on newuu.uz is linked or dismissed.</p>}
          {data.people.map((p) => (
            <Link key={p.siteId} href={href(p.siteId)} className={cx(s.listCard, sel?.siteId === p.siteId && s.listCardActive)} prefetch={false} scroll={false}>
              <span className={s.listTitle}>{p.name}</span>
              <span className={s.listMeta}>{[p.line, p.why].filter(Boolean).join(" · ")}</span>
            </Link>
          ))}
        </div>
      </section>
      {sel ? (
        <section className={cx(s.detail, s.detailNarrow)} aria-label="Link to a professor">
          <h2 className={s.h2}>{sel.name}</h2>
          <div className={s.cardSoft}>
            <Label>ON NEWUU.UZ</Label>
            <KV k="Position" wide>{sel.position ?? "—"}</KV>
            <KV k="Department" wide>{sel.department ?? "—"}</KV>
            <KV k="School" wide>{sel.school ?? "—"}</KV>
            <KV k="Office" wide>{sel.office ?? "—"}</KV>
            <KV k="Email" wide>{sel.email ?? "—"}</KV>
          </div>
          <Label>{sel.candidates.length ? "COULD BE" : "NO NAME MATCH IN THE LMS"}</Label>
          {sel.candidates.map((c) => (
            <Candidate key={c.id} c={c} disabled={!canEdit || pending} onPick={() => run(() => assignNewuuPerson(sel.siteId, c.id))} />
          ))}
          <form className={s.search} action="/admin/professors">
            <input type="hidden" name="tab" value="newuu" />
            <input type="hidden" name="person" value={sel.siteId} />
            <input name="q" defaultValue={data.q} placeholder="Find another professor by name" aria-label="Find a professor" autoComplete="off" />
          </form>
          {sel.search.map((c) => (
            <Candidate key={c.id} c={c} disabled={!canEdit || pending} onPick={() => run(() => assignNewuuPerson(sel.siteId, c.id))} />
          ))}
          <div className={s.spacer} />
          {canEdit && (
            <div className={s.actions}>
              <Btn onClick={() => run(() => dismissNewuuPerson(sel.siteId))} disabled={pending}>Dismiss</Btn>
            </div>
          )}
        </section>
      ) : (
        <section className={cx(s.detail, s.detailNarrow)} />
      )}
    </>
  );
}

function Candidate({ c, onPick, disabled }: { c: { id: string; name: string; line: string }; onPick: () => void; disabled: boolean }) {
  return (
    <div className={s.listCard} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 0 0", minWidth: 0 }}>
        <Link href={`/p/${c.id}`} className={s.listTitle}>{c.name}</Link>
        <span className={s.listMeta}>{c.line || `LMS ${c.id}`}</span>
      </div>
      <Btn tone="accent" onClick={onPick} disabled={disabled}>Link</Btn>
    </div>
  );
}
