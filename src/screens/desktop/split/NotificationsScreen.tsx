"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import type { FeedItemVM, NotificationsData } from "../model";
import n from "../notifications.module.css";
import { Button, ButtonLink, css, cx, Empty, FeedRow, Hint, type FeedKind } from "../parts";

const FILTERS: Array<{ id: "all" | FeedKind; label: string; kinds: FeedKind[] }> = [
  { id: "all", label: "All", kinds: [] },
  { id: "announcement", label: "LMS", kinds: ["announcement"] },
  { id: "grade", label: "Grades", kinds: ["grade"] },
  { id: "absence", label: "Absences", kinds: ["absence"] },
  { id: "file", label: "Files", kinds: ["file"] },
  { id: "anonymous", label: "Anonymous", kinds: ["anonymous"] },
];

export type NotificationActions = {
  /** Server action: mark read (and confirm in the LMS when it asked for "Got it"). */
  markRead?: (id: string) => Promise<unknown>;
  /** Server action: "Got it" — read, and the acknowledgement the LMS asked for. */
  acknowledge?: (id: string) => Promise<unknown>;
  markAllRead?: () => Promise<unknown>;
};

/** D7 Notifications (D18 when all read) — list on the left, the open one on the right. J/K move, E "Got it", O opens the course, ⇧R reads all. */
export function NotificationsScreen({ data, actions }: { data: NotificationsData; actions?: NotificationActions }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [openId, setOpenId] = useState<string | null>(data.open ?? data.items[0]?.id ?? null);
  const [, startTransition] = useTransition();
  const [items, markRead] = useOptimistic(data.items, (state: FeedItemVM[], id: string | "all") => state.map((i) => (id === "all" || i.id === id ? { ...i, unread: false } : i)));

  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    return filter === "all" ? items : items.filter((i) => f.kinds.includes(i.kind));
  }, [items, filter]);
  const sections = useMemo(() => {
    const out: Array<{ title: string; items: FeedItemVM[] }> = [];
    for (const i of shown) {
      const title = i.section ?? "Earlier";
      const last = out[out.length - 1];
      if (last?.title === title) last.items.push(i);
      else out.push({ title, items: [i] });
    }
    return out;
  }, [shown]);
  const open = items.find((i) => i.id === openId) ?? null;

  const read = (id: string | "all") =>
    startTransition(async () => {
      markRead(id);
      if (id === "all") await actions?.markAllRead?.();
      else if (items.find((i) => i.id === id)?.needsAck && actions?.acknowledge) await actions.acknowledge(id);
      else await actions?.markRead?.(id);
    });

  const allRead = items.length === 0 || items.every((i) => !i.unread);

  return (
    <div data-desktop-screen className={cx(css.screen, n.split)}>
      <nav className={n.list} aria-label="Notifications">
        <div className={n.head}>
          <h1 className={n.title}>Notifications</h1>
          {!allRead && (
            <button type="button" className={n.readAll} onClick={() => read("all")} data-key="shift+r">
              <Hint>⇧R read all</Hint>
            </button>
          )}
        </div>
        <div className={css.chips} role="tablist" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={cx(css.chip, filter === f.id && css.chipOn)} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <Empty title="All read">Grades, absences, LMS announcements and Anonymous replies land here. You&apos;ll also get them in the bot.</Empty>
        ) : (
          <div className={cx(n.items, css.navList)} data-nav-list="select" data-nav-arrows>
            {sections.map((s) => (
              <div key={s.title} className={n.items}>
                <p className={n.section}>{s.title}</p>
                {s.items.map((i) => (
                  <FeedRow
                    key={i.id}
                    kind={i.kind}
                    title={i.title}
                    meta={i.meta}
                    unread={i.unread}
                    selected={i.id === openId}
                    onClick={() => {
                      setOpenId(i.id);
                      if (i.unread && !i.needsAck) read(i.id);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </nav>

      <main className={n.detail}>
        {open && (
          <>
            {open.eyebrow && <p className={n.eyebrow}>{open.eyebrow}</p>}
            <h2 className={n.detailTitle}>{open.title}</h2>
            {open.body && open.body.length > 0 && (
              <div className={n.body}>
                {open.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}
            <div className={n.actions}>
              {(open.needsAck || open.unread) && (
                <>
                  <Button onClick={() => read(open.id)} keyName="e" disabled={!open.unread}>
                    Got it
                  </Button>
                  <Hint>E</Hint>
                </>
              )}
              {open.open && (
                <>
                  <ButtonLink href={open.open.href} variant="secondary" keyName="o">
                    {open.open.label}
                  </ButtonLink>
                  <Hint>O</Hint>
                </>
              )}
            </div>
            {open.needsAck && <p className={n.note}>Got it marks it read and confirms it in LMS. J / K move between notifications.</p>}
          </>
        )}
      </main>
    </div>
  );
}
