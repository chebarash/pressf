import Link from "next/link";
import { cx } from "@/ui/components";
import b from "./parts/base.module.css";
import { MainButton } from "./parts/MainButton";
import { Notice } from "./parts/Notice";
import { RateSheet } from "./parts/RateSheet";
import s from "./parts/Rate.module.css";
import type { RateScreen } from "./views";

/**
 * Mobile To rate (Figma 4.10) with the rating sheet on top (4.11 queue,
 * 4.12 single course, 4.19 incomplete, 4.20 couldn't send).
 */
export default function Rate({ data }: { data: RateScreen }) {
  const done = data.total - data.waiting.length;
  const first = data.waiting[0];
  return (
    <div className={cx(b.screen, !first && b.noButton)}>
      <header className={b.head}>
        <h1 className={b.title}>To rate</h1>
        <p className={b.sub}>
          {done} of {data.total} rated · anonymous · next year&apos;s students choose by this
        </p>
      </header>
      <div className={s.progress} role="progressbar" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={done} aria-label="Rated">
        <span style={{ width: `${data.total ? (done / data.total) * 100 : 0}%` }} />
      </div>

      {data.waiting.length ? (
        <section className={s.group}>
          <h2 className={b.label}>Waiting</h2>
          {data.waiting.map((w) => (
            <Link key={`${w.courseId}|${w.term}`} href={w.href} className={s.waiting} prefetch scroll={false}>
              <span className={b.rowBody}>
                <span className={b.rowTitle}>{w.name}</span>
                <span className={b.rowSub}>{[w.term, w.teachers[0]?.name].filter(Boolean).join(" · ")}</span>
              </span>
              <span className={s.cta}>Rate</span>
            </Link>
          ))}
        </section>
      ) : null}

      {data.rated.length ? (
        <section className={s.group}>
          <h2 className={b.label}>Rated</h2>
          {data.rated.map((r) =>
            r.canEdit ? (
              <Link key={`${r.courseId}|${r.term}`} href={r.href} className={b.row} prefetch scroll={false}>
                <span className={b.rowBody}>
                  <span className={b.rowTitle}>{r.name}</span>
                  <span className={b.rowSub}>{[r.term, r.teachers[0]?.name, r.updatedLabel].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={s.edit}>Edit</span>
              </Link>
            ) : (
              <div key={`${r.courseId}|${r.term}`} className={b.row}>
                <span className={b.rowBody}>
                  <span className={b.rowTitle}>{r.name}</span>
                  <span className={b.rowSub}>{[r.term, r.teachers[0]?.name, r.updatedLabel].filter(Boolean).join(" · ")}</span>
                </span>
              </div>
            ),
          )}
        </section>
      ) : null}

      {data.open ? (
        <RateSheet key={`${data.open.item.courseId}|${data.open.item.term}`} open={data.open} queue={data.waiting} />
      ) : first ? (
        <MainButton text={`Rate ${data.waiting.length} ${data.waiting.length === 1 ? "course" : "courses"}`} href={first.href} shine secondary={{ text: "Later", href: "/" }} />
      ) : null}
      {data.notice === "rating-sent" ? <Notice text="Rating sent. Thanks — it's anonymous." param="sent" /> : null}
    </div>
  );
}
