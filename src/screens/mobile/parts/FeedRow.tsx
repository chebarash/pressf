import type { FeedKind } from "@/core/notifications";
import type { FeedView } from "@/server/views";
import { FeedItem, type FeedType } from "@/ui/components";
import s from "../mobile.module.css";

const TYPE: Record<FeedKind, FeedType> = {
  announcement: "announcement", grade: "grade", absence: "absence", file: "files", deadline: "deadline", anonymous: "anonymous", upload: "files", system: "room",
};

const SOURCE: Partial<Record<FeedKind, string>> = { announcement: "LMS", anonymous: "Anonymous" };

/** "LMS · Calculus 1 · 1 h ago · needs your OK". */
export const feedMeta = (item: FeedView) => [SOURCE[item.kind], item.courseName, item.ago, item.needsAck ? "needs your OK" : null].filter(Boolean).join(" · ");

/** One feed entry (kit FeedItem): a link on Today, a button that opens the sheet on Notifications. */
export function FeedRow({ item, href, onOpen }: { item: FeedView; href?: string; onOpen?: () => void }) {
  const row = <FeedItem type={TYPE[item.kind] ?? "announcement"} title={item.title} meta={feedMeta(item)} unread={!item.read} href={href} />;
  if (href) return row;
  return (
    <button type="button" className={s.rowButton} onClick={onOpen}>
      {row}
    </button>
  );
}
