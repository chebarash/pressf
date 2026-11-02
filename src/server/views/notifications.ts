import { filterFeed, FILTERS, sections, unreadCount, type FeedKind } from "@/core/notifications";
import { feed } from "@/server/feed";
import { coursesByIds, feedView, type FeedView } from "./shared";
import { loadStudent, type SyncState } from "./student";

/** Notifications (Figma 2.9, 2.10): the unified feed with filters and sections. */

export type FeedFilter = (typeof FILTERS)[number]["id"] | "deadline";

export type NotificationsView = {
  sync: SyncState;
  unread: number;
  filter: FeedFilter;
  filters: Array<{ id: FeedFilter; label: string; count: number }>;
  sections: Array<{ title: "Today" | "This week" | "Earlier"; items: FeedView[] }>;
  /** The item opened with ?open=, if it exists. */
  open: FeedView | null;
};

const ALL_FILTERS: Array<{ id: FeedFilter; label: string; kinds: FeedKind[] }> = [
  ...FILTERS,
  { id: "deadline", label: "Deadlines", kinds: ["deadline"] },
];

export async function notifications(userId: string, opts: { filter?: string; open?: string } = {}, now = new Date()): Promise<NotificationsView | null> {
  const student = await loadStudent(userId);
  if (!student) return null;
  const items = await feed(userId, 200);
  const names = await coursesByIds(items.map((i) => i.courseId ?? "").filter(Boolean));
  const filter = (ALL_FILTERS.find((f) => f.id === opts.filter)?.id ?? "all") as FeedFilter;
  const shown = filter === "deadline" ? items.filter((i) => i.kind === "deadline") : filterFeed(items, filter);
  const opened = opts.open ? items.find((i) => i.id === opts.open) : undefined;
  return {
    sync: student.state,
    unread: unreadCount(items),
    filter,
    filters: ALL_FILTERS.map((f) => ({ id: f.id, label: f.label, count: f.kinds.length ? items.filter((i) => f.kinds.includes(i.kind)).length : items.length })),
    sections: sections(shown, now).map((s) => ({ title: s.title, items: s.items.map((i) => feedView(i, now, names)) })),
    open: opened ? feedView(opened, now, names) : null,
  };
}
