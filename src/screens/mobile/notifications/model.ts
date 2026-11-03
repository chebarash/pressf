import type { FeedFilter, FeedView, NotificationsView } from "@/server/views";

export type FeedChange = { type: "read"; ids: string[] } | { type: "ack"; id: string };

type Sections = NotificationsView["sections"];

const apply = (i: FeedView, c: FeedChange): FeedView =>
  c.type === "read"
    ? // Reading never clears an acknowledgement the LMS asked for; only "Got it" does.
      c.ids.includes(i.id) && !i.needsAck
      ? { ...i, read: true }
      : i
    : i.id === c.id
      ? { ...i, read: true, needsAck: false }
      : i;

/** The optimistic feed after a change, before the server confirms it. */
export const applyChange = (sections: Sections, c: FeedChange): Sections => sections.map((s) => ({ ...s, items: s.items.map((i) => apply(i, c)) }));

export const allItems = (sections: Sections) => sections.flatMap((s) => s.items);

/** Ids "Mark all read" can clear (not the ones waiting for "Got it"). */
export const readable = (sections: Sections) => allItems(sections).filter((i) => !i.read && !i.needsAck).map((i) => i.id);

/** Filter chips in the order Figma 2.9 shows them. */
const ORDER: FeedFilter[] = ["all", "announcement", "anonymous", "grade", "absence", "file", "deadline"];
export const orderedFilters = (filters: NotificationsView["filters"]) =>
  [...filters].sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));

/** Unread count after optimistic changes: the server's count minus what this screen has read since. */
export function unreadNow(view: NotificationsView, sections: Sections) {
  const before = allItems(view.sections).filter((i) => !i.read).length;
  const after = allItems(sections).filter((i) => !i.read).length;
  return Math.max(0, view.unread - (before - after));
}
