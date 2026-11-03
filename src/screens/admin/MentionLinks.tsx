"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { hideMentionLink, restoreMentionLink } from "@/app/admin/actions";
import type { mentionLinksPage } from "@/server/admin/mention-links";
import { Head, Label, cx, s } from "./ui";
import { AdminToast, type Note } from "./Toast";

export type MentionLinksData = Awaited<ReturnType<typeof mentionLinksPage>>;
type Post = MentionLinksData["posts"][number];
type Chip = Post["links"][number];

const hrefFor = (p: { q?: string; kind?: string | null; target?: string | null }) => {
  const q = new URLSearchParams({ tab: "links" });
  if (p.q) q.set("q", p.q);
  if (p.kind && p.target) {
    q.set("kind", p.kind);
    q.set("target", p.target);
  }
  return `/admin/reports?${q}`;
};

/**
 * A4 Reports · Links: the courses and professors found in Anonymous posts. A
 * wrong one is hidden (and stays hidden through every re-match); hidden ones
 * can be restored. Authors are never shown: Press F doesn't have them.
 */
export function MentionLinks({ data, counts }: { data: MentionLinksData; counts: { open: number; resolved: number } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<Note>(null);
  const [q, setQ] = useState(data.filter.q);

  const toggle = (post: Post, chip: Chip) =>
    start(async () => {
      const ref = { postId: post.id, kind: chip.kind, target: chip.target };
      const r = chip.hidden ? await restoreMentionLink(ref) : await hideMentionLink(ref);
      setToast(r.ok ? (chip.hidden ? "Link restored" : "Link hidden · stays hidden after re-matching") : { text: r.error, error: true });
      router.refresh();
    });

  const postCard = (p: Post) => (
    <div key={p.id} className={s.card} style={{ gap: 8 }}>
      <div style={{ fontSize: 15, lineHeight: 1.45, whiteSpace: "pre-line" }}>{p.text}</div>
      <div className={s.hstack} style={{ flexWrap: "wrap", gap: 6 }}>
        {p.links.map((l) => (
          <span key={`${l.kind}|${l.target}`} className={cx(s.chip, l.hidden ? s.chipRust : l.kind === "course" ? s.chipTeal : s.chipPlum)} style={{ gap: 6 }}>
            <span style={{ textDecoration: l.hidden ? "line-through" : undefined }}>{l.label}</span>
            <button
              type="button"
              className={s.link}
              disabled={pending}
              onClick={() => toggle(p, l)}
              aria-label={l.hidden ? `Restore ${l.label}` : `Hide ${l.label} on this post`}
              style={{ border: 0, background: "none", padding: 0, cursor: "pointer", font: "inherit" }}
            >
              {l.hidden ? "Restore" : "Hide"}
            </button>
          </span>
        ))}
        <div className={s.spacer} />
        <a className={s.small} href={p.url} target="_blank" rel="noreferrer">Open the post ↗</a>
      </div>
    </div>
  );

  return (
    <>
      <section className={s.main}>
        <Head title="Reports" sub="Courses and professors found in Anonymous posts. Hide a wrong one; it stays hidden after every re-match." />
        <div className={s.tabs}>
          <Link href="/admin/reports" className={s.chip}>Open {counts.open}</Link>
          <Link href="/admin/reports?tab=resolved" className={s.chip}>Resolved {counts.resolved}</Link>
          <Link href="/admin/reports?tab=links" className={cx(s.chip, s.chipInverse)}>Links {data.totals.course + data.totals.teacher}</Link>
        </div>
        <form
          className={s.search}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            router.replace(hrefFor({ q, kind: data.filter.kind, target: data.filter.target }));
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find posts by text" aria-label="Find posts by text" />
        </form>
        <div className={s.hstack} style={{ flexWrap: "wrap", gap: 6 }}>
          <span className={s.small}>{data.totals.course} course links · {data.totals.teacher} professor links · {data.totals.hidden} hidden</span>
          {data.filter.label && (
            <Link className={cx(s.chip, s.chipInverse)} href={hrefFor({ q: data.filter.q })}>{data.filter.label} ✕</Link>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.posts.length === 0 && <p className={s.small}>No linked posts{data.filter.q ? " with that text" : ""}.</p>}
          {data.posts.map(postCard)}
        </div>
      </section>
      <section className={s.detail} aria-label="Most mentioned">
        <Label>MOST MENTIONED COURSES</Label>
        <div className={s.hstack} style={{ flexWrap: "wrap", gap: 6 }}>
          {data.top.course.map((t) => (
            <Link key={t.target} className={s.chip} href={hrefFor({ kind: "course", target: t.target })}>{t.label} · {t.posts}</Link>
          ))}
        </div>
        <Label>MOST MENTIONED PROFESSORS</Label>
        <div className={s.hstack} style={{ flexWrap: "wrap", gap: 6 }}>
          {data.top.teacher.map((t) => (
            <Link key={t.target} className={s.chip} href={hrefFor({ kind: "teacher", target: t.target })}>{t.label} · {t.posts}</Link>
          ))}
        </div>
        {data.recentlyHidden.length > 0 && (
          <>
            <Label>RECENTLY HIDDEN</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{data.recentlyHidden.map(postCard)}</div>
          </>
        )}
        <p className={s.note} style={{ margin: 0 }}>Author: hidden from admins too. Links come from course codes, course names and professor names in the text.</p>
      </section>
      <AdminToast note={toast} />
    </>
  );
}
