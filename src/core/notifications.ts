import { localDay, addDays } from "./time";

/**
 * One feed for everything that happened: LMS announcements, grades, absences,
 * new files, deadlines, Anonymous replies, upload results and system notes.
 * The same items go to the in-app feed and, by the student's settings, the bot.
 */

export type FeedKind = "announcement" | "grade" | "absence" | "file" | "deadline" | "anonymous" | "upload" | "system";

export type FeedItem = {
  id: string;
  kind: FeedKind;
  title: string;
  body?: string;
  courseId?: string;
  courseName?: string;
  at: Date;
  read: boolean;
  /** The LMS asks the student to confirm they have read it ("Got it"). */
  needsAck?: boolean;
  /** Deep link inside Press F. */
  href?: string;
};

export type LmsNotification = {
  id: string | number;
  title?: string | null;
  body?: string | null;
  author?: string | null;
  created_at?: string | number | null;
  publicate_at?: string | number | null;
  read?: number | string | boolean | null;
  required?: number | string | boolean | null;
  acquainted?: number | string | boolean | null;
};

const truthy = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

// "<" and ">" never come back as real angle brackets: the result is plain text,
// and a decoded "&lt;script&gt;" must not turn into markup in the bot or the app.
const ENTITIES: Record<string, string> = { amp: "&", lt: "‹", gt: "›", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** LMS bodies are HTML; the feed and the bot get plain text with no tags left in it. */
export function plainText(html: string | null | undefined) {
  let text = (html ?? "")
    .replace(/<(br|\/p|\/div|\/li)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  // Strip until nothing changes, so nested pieces like "<scr<b>ipt>" cannot reassemble a tag.
  for (let prev = ""; prev !== text; ) {
    prev = text;
    text = text.replace(/<[^<>]*>/g, "");
  }
  return text
    .replace(/[<>]/g, (c) => (c === "<" ? "‹" : "›"))
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const asDate = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(String(v).replace(" ", "T") + (/[zZ+]/.test(String(v)) ? "" : "+05:00"));
  return Number.isNaN(d.getTime()) ? null : d;
};

export function fromLms(n: LmsNotification): FeedItem {
  const needsAck = truthy(n.required) && !truthy(n.acquainted);
  return {
    id: `lms:${n.id}`,
    kind: "announcement",
    title: plainText(n.title) || "LMS announcement",
    body: plainText(n.body) || undefined,
    at: asDate(n.publicate_at) ?? asDate(n.created_at) ?? new Date(0),
    read: truthy(n.read) && !needsAck,
    needsAck,
  };
}

/** Newest first; the same id from two sources is kept once (the unread copy wins). */
export function mergeFeed(...lists: FeedItem[][]): FeedItem[] {
  const by = new Map<string, FeedItem>();
  for (const item of lists.flat()) {
    const prev = by.get(item.id);
    if (!prev || (!item.read && prev.read)) by.set(item.id, item);
  }
  return [...by.values()].sort((a, b) => b.at.getTime() - a.at.getTime());
}

export const unreadCount = (items: FeedItem[]) => items.filter((i) => !i.read).length;

export type FeedSection = { title: "Today" | "This week" | "Earlier"; items: FeedItem[] };

export function sections(items: FeedItem[], now: Date): FeedSection[] {
  const today = localDay(now);
  const weekAgo = addDays(today, -6);
  const out: FeedSection[] = [
    { title: "Today", items: [] },
    { title: "This week", items: [] },
    { title: "Earlier", items: [] },
  ];
  for (const i of items) {
    const d = localDay(i.at);
    out[d === today ? 0 : d >= weekAgo ? 1 : 2].items.push(i);
  }
  return out.filter((s) => s.items.length);
}

export const FILTERS: Array<{ id: "all" | FeedKind; label: string; kinds: FeedKind[] }> = [
  { id: "all", label: "All", kinds: [] },
  { id: "announcement", label: "LMS", kinds: ["announcement"] },
  { id: "grade", label: "Grades", kinds: ["grade"] },
  { id: "absence", label: "Absences", kinds: ["absence"] },
  { id: "file", label: "Files", kinds: ["file"] },
  { id: "anonymous", label: "Anonymous", kinds: ["anonymous"] },
];

export const filterFeed = (items: FeedItem[], filter: (typeof FILTERS)[number]["id"]) =>
  filter === "all" ? items : items.filter((i) => FILTERS.find((f) => f.id === filter)!.kinds.includes(i.kind));

/** Alert settings: which kinds go to the bot. Defaults on for what is time-critical. */
export type AlertSettings = Record<FeedKind | "digest" | "classReminder" | "qrReminder" | "rating", boolean>;

export const DEFAULT_ALERTS: AlertSettings = {
  digest: true, classReminder: true, qrReminder: true, absence: true, grade: true, file: false,
  announcement: true, deadline: true, anonymous: true, upload: true, system: true, rating: true,
};

/** Quiet hours 22:00–08:00 Tashkent; urgent kinds still go through. */
export function deliverNow(kind: FeedKind, localMinutes: number) {
  const quiet = localMinutes >= 22 * 60 || localMinutes < 8 * 60;
  return !quiet || kind === "absence";
}
