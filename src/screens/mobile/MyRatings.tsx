import Link from "next/link";
import type { RatedItem, RateQueueView } from "@/server/views";
import { EmptyState } from "./mc/kit";
import { cx, Screen } from "./mc/parts";
import s from "./mc/mc.module.css";

const RECOMMEND: Record<RatedItem["recommend"], string> = { yes: "recommended", unsure: "not sure", no: "didn't recommend" };

/** Mobile My ratings (Figma 8.6): your ratings (only you see them), then what is waiting. */
export default function MyRatings({ data }: { data: RateQueueView }) {
  const empty = !data.rated.length && !data.waiting.length;
  return (
    <Screen>
      <div className={cx(s.body, s.tight)}>
        <h1 className={`${s.title54} pf-m-title`}>My ratings</h1>
        <p className={cx(s.p0, s.t14, s.soft)} style={{ lineHeight: 1.4 }}>
          Only you can see this. Edit until the end of next semester.
        </p>
        {empty ? <EmptyState title="Nothing rated yet" text="When a semester ends, its courses show up here to rate. 30 seconds each, anonymous." /> : null}
        {data.rated.map((r) => (
          <Row
            key={`${r.courseId}|${r.term}`}
            href={r.canEdit ? r.href : null}
            title={r.name}
            line={[r.term, RECOMMEND[r.recommend], ...r.pressedF.map((t) => `pressed F for ${t}`)].join(" · ")}
            action={r.canEdit ? "Edit" : null}
          />
        ))}
        {data.waiting.map((w) => (
          <Row key={`${w.courseId}|${w.term}`} href={w.href} title={w.name} line={`${w.term} · waiting`} action="Rate" strong />
        ))}
      </div>
    </Screen>
  );
}

function Row({ href, title, line, action, strong }: { href: string | null; title: string; line: string; action: string | null; strong?: boolean }) {
  const body = (
    <>
      <div className={s.lines}>
        <p className={s.t15sb}>{title}</p>
        <p className={cx(s.t12, s.soft)} style={{ lineHeight: 1.32 }}>
          {line}
        </p>
      </div>
      {action ? <span className={cx(s.t14sb, strong ? s.accentText : s.soft)}>{action}</span> : null}
    </>
  );
  const cls = cx(s.rowCard, !strong && s.quiet, href && s.pressable);
  return href ? (
    <Link href={href} prefetch className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
