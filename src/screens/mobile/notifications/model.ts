import type { FeedFilter, FeedView, NotificationsView } from "@/server/views";

export type FeedChange = { type: "read"; ids: string[] };

type Sections = NotificationsView["sections"];

// Opening is reading; when the LMS asked for a confirmation, opening gives it.
const apply = (i: FeedView, c: FeedChange): FeedView =>
  c.ids.includes(i.id) && !i.read ? { ...i, read: true, needsAck: false, acknowledged: i.acknowledged || i.needsAck } : i;

/** The optimistic feed after a change, before the server confirms it. */
export const applyChange = (sections: Sections, c: FeedChange): Sections => sections.map((s) => ({ ...s, items: s.items.map((i) => apply(i, c)) }));

export const allItems = (sections: Sections) => sections.flatMap((s) => s.items);

/** Ids "Mark all read" can clear (not the ones the LMS wants confirmed: those are read by opening them). */
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
