"use client";

import { useRouter } from "next/navigation";
import { useCallback, useOptimistic, useState, useTransition } from "react";
import type { FeedKind } from "@/core/notifications";
import type { FeedView, NotificationsView } from "@/server/views";
import { Chip, EmptyState } from "@/ui/components";
import { markAllFeedRead, markFeedRead } from "./actions";
import s from "./mobile.module.css";
import { allItems, applyChange, orderedFilters, readable, unreadNow } from "./notifications/model";
import { ActionSheet } from "./parts/ActionSheet";
import { FeedRow } from "./parts/FeedRow";
import { useToast } from "./parts/toast";

const KIND_LABEL: Record<FeedKind, string> = {
  announcement: "LMS announcement", grade: "New grade", absence: "Attendance", file: "New files", deadline: "Deadline", anonymous: "Anonymous", upload: "Your upload", system: "Press F",
};

const query = (filter: string, open?: string) => {
  const p = new URLSearchParams();
  if (filter !== "all") p.set("filter", filter);
  if (open) p.set("open", open);
  const q = p.toString();
  return q ? `/notifications?${q}` : "/notifications";
};

/** Notifications on mobile (Figma 2.9, 2.10). */
export default function Notifications({ data }: { data: NotificationsView }) {
  const router = useRouter();
  const [sections, change] = useOptimistic(data.sections, applyChange);
  const [, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(data.open?.id ?? null);
  const [toastView, toast] = useToast();

  const items = allItems(sections);
  const open: FeedView | null = openId ? (items.find((i) => i.id === openId) ?? (data.open?.id === openId ? data.open : null)) : null;
  const unread = unreadNow(data, sections);
  const canMarkAll = readable(sections).length > 0;

  const openItem = (item: FeedView) => {
    setOpenId(item.id);
    // Opening reads it (and confirms it in the LMS when the teacher asked).
    if (!item.read)
      start(async () => {
        change({ type: "read", ids: [item.id] });
        await markFeedRead(item.id);
      });
  };

  const close = useCallback(() => {
    setOpenId(null);
    if (data.open) router.replace(query(data.filter), { scroll: false });
  }, [data.open, data.filter, router]);

  const markAll = () => {
    const ids = readable(sections);
    toast("All notifications marked as read");
    start(async () => {
      change({ type: "read", ids });
      await markAllFeedRead();
    });
  };

  return (
    <div className={`${s.screen} ${s.notifBody}`}>
      <h1 className={s.notifTitle}>Notifications</h1>
      <div className={s.unreadRow}>
        <p className={s.unreadCount}>{unread ? `${unread} unread` : "All read"}</p>
        <button type="button" className={s.linkButton} onClick={markAll} disabled={!canMarkAll}>
          Mark all read
        </button>
      </div>
      <nav className={s.chips} aria-label="Filter">
        {orderedFilters(data.filters).map((f) => (
          <Chip key={f.id} size="s" href={query(f.id)} label={f.label} selected={data.filter === f.id} />
        ))}
      </nav>

      {sections.length ? (
        sections.map((sec) => (
          <section key={sec.title} aria-label={sec.title} className={s.feedSection}>
            <h2 className={s.feedSectionTitle}>{sec.title}</h2>
            {sec.items.map((i) => (
              <FeedRow key={i.id} item={i} onOpen={() => openItem(i)} />
            ))}
          </section>
        ))
      ) : (
        <EmptyState
          title={data.filter === "all" ? "Nothing here yet" : "Nothing in this filter"}
          text="LMS announcements, grades, absences and new files show up here as they happen."
        />
      )}

      {toastView}
      {open && (
        <ActionSheet
          title={open.title}
          onClose={close}
          className={s.noteSheet}
          main={open.href ? { text: "Open", onClick: () => router.push(open.href!) } : { text: "Close", onClick: close }}
        >
          <p className={s.sheetEyebrow}>{[KIND_LABEL[open.kind], open.courseName, open.author, open.ago].filter(Boolean).join(" · ")}</p>
          <h2 className={s.noteTitle}>{open.title}</h2>
          {open.body && <p className={s.sheetBody}>{open.body}</p>}
          {open.acknowledged && <p className={s.noteFine}>Acknowledged in LMS</p>}
        </ActionSheet>
      )}
    </div>
  );
}
