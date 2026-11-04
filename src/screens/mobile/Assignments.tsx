import { shortDate } from "@/core/time";
import type { AssignmentsView, DeadlineView } from "@/server/views";
import { Banner, EmptyState } from "./mc/kit";
import { cx, RowLink, Screen } from "./mc/parts";
import { lowerDay, since } from "./mc/format";
import s from "./mc/mc.module.css";

const TONE: Record<DeadlineView["status"], string> = {
  todo: s.lowText, "in-progress": s.soft, submitted: s.soft, checked: s.accentText, missed: s.lowText, archived: s.soft,
};

/** Mobile Assignments (Figma 5.4): LMS homework grouped by what to do next. */
export default function Assignments({ data }: { data: AssignmentsView }) {
  const due = (d: DeadlineView) => lowerDay(d.dueLabel);
  const groups: Array<[string, DeadlineView[], (d: DeadlineView) => string]> = [
    ["Due this week", data.dueThisWeek, due],
    ["Later", data.later, due],
    ["Waiting for a grade", data.waiting, (d) => `sent ${shortDate(new Date(d.due))}`],
    ["Graded", data.graded, (d) => (d.grade !== null ? String(d.grade) : `due ${shortDate(new Date(d.due))}`)],
    ["Missed", data.missed, (d) => `was due ${shortDate(new Date(d.due))}`],
  ];
  const any = groups.some(([, items]) => items.length);
  return (
    <Screen>
      <div className={cx(s.body, s.tight)}>
        <h1 className={`${s.title54} pf-m-title`}>Assignments</h1>
        {data.state.lmsDown ? (
          <Banner tone="warning" action={{ label: "Retry", href: "?retry=1" }}>
            LMS isn&apos;t answering. Assignments are from {since(data.state.syncedAt)}.
          </Banner>
        ) : null}
        {!any ? <EmptyState title="Nothing due" text="When a teacher sets work in the LMS, it shows up here with its deadline." /> : null}
        {groups
          .filter(([, items]) => items.length)
          .map(([title, items, line]) => (
            <section key={title} className={cx(s.stack, s.tight)} aria-label={title}>
              <h2 className={s.label}>{title}</h2>
              {items.map((d) => {
                const lines = (
                  <div className={cx(s.lines, s.lines4)}>
                    <p className={s.t15sb}>{d.title}</p>
                    <p className={cx(s.t12, s.soft)}>{[d.course, line(d)].filter(Boolean).join(" · ")}</p>
                    <p className={cx(s.t12sb, TONE[d.status])}>{title === "Missed" ? "Missed" : d.statusLabel}</p>
                  </div>
                );
                const href = data.courseHref?.[d.course];
                return href ? (
                  <RowLink key={d.id} href={href}>
                    {lines}
                  </RowLink>
                ) : (
                  <div key={d.id} className={s.rowCard}>
                    {lines}
                  </div>
                );
              })}
            </section>
          ))}
      </div>
    </Screen>
  );
}
