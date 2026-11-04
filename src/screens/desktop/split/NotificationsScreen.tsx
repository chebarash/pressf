"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import type { FeedItemVM, NotificationsData } from "../model";
import n from "../notifications.module.css";
import { FeedMark, FileRow } from "@/ui/components";
import { PageHead } from "@/ui/shell/PageHeader";
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
  /** Server action: opening reads it (and confirms it in the LMS when the LMS asked). */
  markRead?: (id: string) => Promise<unknown>;
  markAllRead?: () => Promise<unknown>;
};

/** D7 Notifications (D18 when all read) — list on the left, the open one on the right. J/K move, O opens the course, ⇧R reads all. */
export function NotificationsScreen({ data, actions }: { data: NotificationsData; actions?: NotificationActions }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [openId, setOpenId] = useState<string | null>(data.open ?? data.items[0]?.id ?? null);
  // Narrow windows show one pane: the list, or the one being read (a link that names one opens on it).
  const [reading, setReading] = useState(!!data.named);
  const [, startTransition] = useTransition();
  const [items, markRead] = useOptimistic(data.items, (state: FeedItemVM[], id: string | "all") =>
    state.map((i) =>
      id === i.id && i.unread
        ? { ...i, unread: false, needsAck: false, acknowledged: i.acknowledged || i.needsAck }
        : // Read all leaves the ones the LMS wants confirmed: they are read by opening them.
          id === "all" && !i.needsAck
          ? { ...i, unread: false }
          : i,
    ),
  );

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
      else await actions?.markRead?.(id);
    });

  const allRead = items.length === 0 || items.every((i) => !i.unread || i.needsAck);

  return (
    <div data-desktop-screen data-open={reading || undefined} className={cx(css.screen, n.split)}>
      <nav className={n.list} aria-label="Notifications">
        <PageHead title="Notifications">
          {/* Shown in D18 (all read) too; nothing to do then. */}
          <button type="button" className={n.readAll} onClick={() => !allRead && read("all")} disabled={allRead} data-key="shift+r">
            <Hint>⇧R read all</Hint>
          </button>
        </PageHead>
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
                    files={i.files}
                    mark={i.mark}
                    selected={i.id === openId}
                    onClick={() => {
                      setOpenId(i.id);
                      setReading(true);
                      if (i.unread) read(i.id);
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
            {/* One pane at a time on a narrow window: back to the list. */}
            <button type="button" className={cx("pf-head__back", n.narrowOnly)} onClick={() => setReading(false)}>
              <span aria-hidden>‹</span> Notifications
            </button>
            {open.eyebrow && <p className={n.eyebrow}>{open.eyebrow}</p>}
            <h2 className={cx(n.detailTitle, open.title.length > 56 && n.detailTitleLong)} title={open.title}>
              {open.title}
            </h2>
            {open.body && open.body.length > 0 && (
              <div className={n.body}>
                {open.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )}
            {open.mark && (
              // The pane's own button goes to the course's progress ("See grades", "See attendance").
              <div className={n.mark}>
                <FeedMark grade={open.mark.grade} attendance={open.mark.attendance} size="pane" />
              </div>
            )}
            {open.files && (
              <div className={n.files}>
                {open.files.shown.map((f) => (
                  <FileRow key={f.id} title={f.title} type={f.type} week={f.typeLabel} href={f.href} />
                ))}
                {open.files.more > 0 &&
                  (open.files.moreHref ? (
                    <Link prefetch href={open.files.moreHref} className={n.more}>
                      and {open.files.more} more
                    </Link>
                  ) : (
                    <p className={n.more}>and {open.files.more} more</p>
                  ))}
              </div>
            )}
            <div className={n.actions}>
              {open.open && (
                <>
                  <ButtonLink href={open.open.href} variant="secondary" keyName="o">
                    {open.open.label}
                  </ButtonLink>
                  <Hint>O</Hint>
                </>
              )}
            </div>
            {open.acknowledged && <p className={n.note}>Acknowledged in LMS</p>}
          </>
        )}
      </main>
    </div>
  );
}
