import type { FeedKind } from "@/core/notifications";
import { shortDate, weekdayName } from "@/core/time";
import type { FeedView } from "@/server/views";
import { FeedFiles, FeedItem, type FeedType } from "@/ui/components";
import s from "../mobile.module.css";

const TYPE: Record<FeedKind, FeedType> = {
  announcement: "announcement", grade: "grade", absence: "absence", file: "files", deadline: "deadline", anonymous: "anonymous", upload: "files", system: "room",
};

const SOURCE: Partial<Record<FeedKind, string>> = { announcement: "LMS", anonymous: "Anonymous" };

/** Deadlines and room changes already carry their own time in the line ("Thursday 23:59"). */
const UNTIMED: FeedKind[] = ["deadline", "system"];
const isToday = (ago: string) => ago === "now" || ago.endsWith(" ago");

/**
 * "LMS · Calculus 1 · Gonçalo Pinto · 1 h ago · needs your OK" (Figma 2.9): the byline for LMS announcements.
 * `dated` (the Notifications list) names older days in full: "Physics 1 · Practice 14 · Thu 29 Oct".
 */
export function feedMeta(item: FeedView, dated = false) {
  const when = UNTIMED.includes(item.kind) ? null : dated && !isToday(item.ago) ? `${weekdayName(new Date(item.at)).slice(0, 3)} ${shortDate(new Date(item.at))}` : item.ago;
  // New files already name the course in the title ("3 new files in Deep Learning"): the week and when.
  if (item.files) return [item.body, when].filter(Boolean).join(" · ");
  return [...(item.byline ? [item.byline] : [SOURCE[item.kind], item.courseName]), when, item.needsAck ? "needs your OK" : null].filter(Boolean).join(" · ");
}

/** One feed entry (kit FeedItem): a link on Today, a button that opens the sheet on Notifications. */
export function FeedRow({ item, href, onOpen }: { item: FeedView; href?: string; onOpen?: () => void }) {
  if (item.files) {
    // "3 new files in Deep Learning", then the files (each opens the file) and "and N more".
    return (
      <FeedItem type="files" title={item.title} meta={feedMeta(item, !href)} unread={!item.read} href={href} onClick={href ? undefined : onOpen}>
        <FeedFiles files={item.files.shown} more={item.files.more} moreHref={item.files.courseHref} />
      </FeedItem>
    );
  }
  const row = <FeedItem type={TYPE[item.kind] ?? "announcement"} title={item.title} meta={feedMeta(item, !href)} unread={!item.read} href={href} />;
  if (href) return row;
  return (
    <button type="button" className={s.rowButton} onClick={onOpen}>
      {row}
    </button>
  );
}
