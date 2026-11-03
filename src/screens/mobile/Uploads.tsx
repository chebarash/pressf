import Link from "next/link";
import { BOT_USERNAME } from "@/core/links";
import { cx } from "@/ui/components";
import b from "./parts/base.module.css";
import { TelegramLink } from "./parts/CourseClient";
import s from "./parts/Uploads.module.css";
import type { MyUploadView, UploadsView } from "./views";

const STATUS: Record<MyUploadView["status"], { label: string; cls: string }> = {
  waiting: { label: "Waiting", cls: s.waiting },
  live: { label: "Live", cls: s.live },
  rejected: { label: "Not accepted", cls: s.rejected },
  hidden: { label: "Hidden", cls: s.hidden },
};

const n = new Intl.NumberFormat("en-US");

const lineOf = (u: MyUploadView) =>
  u.status === "live" ? `${u.course} · ${n.format(u.opens)} ${u.opens === 1 ? "open" : "opens"}` : u.status === "waiting" ? `${u.course} · waiting for review` : u.status === "rejected" ? u.reason ?? u.course : `${u.course} · hidden`;

/** Mobile My uploads (Figma 11.7): files the student shared through the bot and where they stand. */
export default function Uploads({ data }: { data: UploadsView }) {
  const sub = data.live ? `${data.live} live · opened ${n.format(data.opens)} ${data.opens === 1 ? "time" : "times"}. Thank you.` : data.items.length ? "Waiting for review — the bot will tell you." : "Exams, notes and mocks you share help the next cohort.";
  return (
    <div className={cx(b.screen, s.body)}>
      <h1 className={s.title}>My uploads</h1>
      <p className={s.sub}>{sub}</p>
      <>
        {data.items.map((u) => {
          const body = (
            <>
              <span className={b.rowBody}>
                <span className={b.rowTitle}>{u.title}</span>
                <span className={b.rowSub}>{lineOf(u)}</span>
              </span>
              <span className={cx(s.status, STATUS[u.status].cls)}>{STATUS[u.status].label}</span>
            </>
          );
          return u.href ? (
            <Link key={u.id} href={u.href} className={b.row} prefetch>
              {body}
            </Link>
          ) : (
            <div key={u.id} className={b.row}>
              {body}
            </div>
          );
        })}
        <TelegramLink href={`https://t.me/${BOT_USERNAME}`} className={cx(b.dashed, b.plum)}>
          <span className={cx(b.rowBody, s.hint)}>
            <span className={b.rowTitle}>{data.items.length ? "Share another file" : "Share a file"}</span>
            <span className={b.rowSub}>Send or forward it to @{BOT_USERNAME} from any chat.</span>
          </span>
        </TelegramLink>
      </>
    </div>
  );
}
