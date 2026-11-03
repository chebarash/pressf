"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { Trust } from "@/core/uploads";
import { messageInBot, setPersonRole, setTrust, signOutEverywhere } from "@/app/admin/actions";
import type { peoplePage } from "@/server/admin/views";
import { Btn, Head, KV, Radio, cx, s } from "./ui";
import { useKeys } from "./useKeys";
import { sortEntries } from "@/core/sort";
import { UrlSortHead } from "@/ui/table/Sort";

export type PeopleData = Awaited<ReturnType<typeof peoplePage>>;

const TRUST: Array<{ id: Trust; label: string; sub: string }> = [
  { id: "normal", label: "Normal", sub: "Every upload waits for review" },
  { id: "trusted", label: "Trusted", sub: "Goes live at once; 1 in 10 spot-checked. Given after 5 live, 0 not accepted" },
  { id: "paused", label: "Paused", sub: "Bot replies that sharing is paused; tells them why" },
];

/** A7 People · student: trust levels drive the upload queue. Roles: Student · Moderator · Admin. */
export function People({ data, viewerId }: { data: PeopleData; viewerId: string }) {
  const router = useRouter();
  const search = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [trust, setLocalTrust] = useState<Trust | null>(data.detail?.trust ?? null);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const d = data.detail;
  const q = (v: string) => `/admin/people?${new URLSearchParams({ ...(data.q ? { q: data.q } : {}), ...sortEntries(data.sort), ...v && { id: v } })}`;

  useKeys({ "/": () => search.current?.focus() });

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, undo?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) undo?.();
      setNote(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Failed" });
      router.refresh();
    });

  const pickTrust = (t: Trust) => {
    if (!d || t === trust) return;
    const before = trust;
    setLocalTrust(t);
    run(() => setTrust(d.id, t), `Trust set to ${t}`, () => setLocalTrust(before));
  };

  return (
    <>
      <section className={cx(s.main, s.mainFixed)} style={{ width: 560 }}>
        <Head title="People" sub={`${data.total.toLocaleString("en-US")} signed in · ${data.trusted} trusted uploaders`} />
        <form className={s.search} action="/admin/people">
          <input ref={search} name="q" defaultValue={data.q} placeholder="Name, Telegram @, LMS id" aria-label="Search people" autoComplete="off" />
          {data.sort && <input type="hidden" name="sort" value={data.sort.key} />}
          {data.sort && <input type="hidden" name="dir" value={data.sort.dir} />}
          <kbd className={s.key}>/ to filter</kbd>
        </form>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <UrlSortHead
            className={cx(s.tr, s.trHead)}
            sort={data.sort}
            columns={[
              { key: "student", label: "STUDENT", className: cx(s.td, s.tdGrow) },
              { key: "uploads", label: "UPLOADS", className: s.td, style: { width: 110 } },
              { key: "trust", label: "TRUST", className: s.td, style: { width: 90 } },
            ]}
          />
          {data.people.length === 0 && <p className={s.small}>Nobody matches “{data.q}”.</p>}
          {data.people.map((p) => (
            <Link key={p.id} href={q(p.id)} className={cx(s.tr, s.trLink, p.id === data.selectedId && s.trSelected)} prefetch={false} scroll={false}>
              <span className={cx(s.td, s.tdGrow, s.tdStrong)}>{p.short}{p.role !== "student" ? ` · ${p.role}` : ""}</span>
              <span className={s.td} style={{ width: 110 }}>{p.uploads}</span>
              <span className={s.td} style={{ width: 90, textTransform: "capitalize" }}>{p.trust}</span>
            </Link>
          ))}
        </div>
      </section>
      {d && (
        <section className={cx(s.detail, s.detailNarrow)} aria-label="Student">
          <div className={s.hstack} style={{ gap: 12 }}>
            <span className={cx(s.avatar, s.avatarLg)}>{d.initials}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 0 0", minWidth: 0 }}>
              <h2 className={s.h2}>{d.name}</h2>
              <div className={s.note}>{d.line || "No LMS data yet"}</div>
            </div>
          </div>
          <div className={s.cardSoft}>
            <KV k="Signed in" wide>{d.signedIn}</KV>
            <KV k="LMS link" wide>{d.lms}</KV>
            <KV k="Bot" wide>{d.bot}</KV>
            <KV k="Ratings" wide>{d.ratings}</KV>
            <KV k="Anonymous" wide>Not visible to admins</KV>
          </div>
          <h3 className={s.h5}>Upload trust</h3>
          {TRUST.map((t) => (
            <button key={t.id} type="button" className={cx(s.option, trust === t.id && s.optionActive)} aria-pressed={trust === t.id} onClick={() => pickTrust(t.id)} disabled={pending}>
              <Radio on={trust === t.id} />
              <span className={s.optionText}>
                <span style={{ fontWeight: 600 }}>{t.label}</span>
                <span className={s.optionSub}>{t.sub}</span>
              </span>
            </button>
          ))}
          {composing && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea className={s.message} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message to ${d.name.split(" ")[0]} in the bot`} maxLength={1000} />
              <div className={s.actions}>
                <Btn tone="accent" disabled={!text.trim() || pending} onClick={() => run(() => messageInBot(d.id, text), "Sent in the bot", undefined)}>Send</Btn>
                <Btn onClick={() => setComposing(false)}>Cancel</Btn>
              </div>
            </div>
          )}
          {note && <div className={note.ok ? s.small : s.error}>{note.text}</div>}
          <div className={s.spacer} />
          <div className={s.actions}>
            <Btn onClick={() => setComposing(true)} disabled={!d.canMessage || pending} title={d.canMessage ? undefined : "Bot not linked"}>Message in bot</Btn>
            <Btn onClick={() => run(() => signOutEverywhere(d.id), "Signed out everywhere")} disabled={pending}>Sign out everywhere</Btn>
            {d.role !== "admin" && d.id !== viewerId && (
              <Btn onClick={() => run(() => setPersonRole(d.id, d.role === "moderator" ? "student" : "moderator"), d.role === "moderator" ? "Now a student" : "Now a moderator")} disabled={pending}>
                {d.role === "moderator" ? "Remove moderator" : "Make moderator"}
              </Btn>
            )}
          </div>
          <p className={s.small} style={{ margin: 0 }}>No passwords are shown or stored in readable form. Ratings and Anonymous posts stay unlinked from people.</p>
        </section>
      )}
    </>
  );
}
