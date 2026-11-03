import Link from "next/link";
import { MoreMentions } from "@/screens/shared/MoreMentions";
import { MentionCard } from "./parts/CourseParts";
import b from "./parts/base.module.css";
import { Fragment } from "react";
import type { ProfessorView } from "@/server/views";
import { Chip, ExternalIcon, Face, RatingSummary, SendIcon, Tag } from "./mc/kit";
import { MainButton } from "./mc/client";
import { cx, Screen } from "./mc/parts";
import { slugify, termShort, trendDelta } from "./mc/format";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";

const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Tashkent" }) : "");

/** "PhD in Applied Mathematics" from the LMS staff profile's degree and field. */
export const degreeLine = (e: { degree: string | null; field: string | null }) => [e.degree, e.field].filter(Boolean).join(" in ") || "Degree";

function ProfileEntry({ title, meta, href }: { title: string; meta: string; href?: string | null }) {
  const body = (
    <>
      <p className={c.entryTitle}>{title}</p>
      {meta ? <p className={cx(s.t12, s.soft)}>{meta}</p> : null}
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={c.entry}>
      {body}
    </a>
  ) : (
    <div className={c.entry}>{body}</div>
  );
}

/** Mobile Professor (Figma 7.4, 7.5 guest, 7.9 few ratings). Faces are drawn, never photos. */
export default function Professor({ data }: { data: ProfessorView }) {
  const sum = data.summary;
  const line = [data.position, data.department && !data.school ? data.department : null].filter(Boolean).join(" · ");
  // School → department, each opening the professor list filtered to it.
  const crumbs = [
    ...(data.school ? [{ label: data.school, href: `/professors?school=${slugify(data.school)}` }] : []),
    ...(data.school && data.department ? [{ label: data.department, href: `/professors?school=${slugify(data.school)}&dept=${slugify(data.department)}` }] : []),
  ];
  // Office, email (mailto) and office hours, from newuu.uz or the admin.
  const contact: Array<{ label: string; href?: string }> = [
    ...(data.office ? [{ label: `Office ${data.office}` }] : []),
    ...(data.email ? [{ label: data.email, href: `mailto:${data.email}` }] : []),
    ...(data.hours ? [{ label: data.hours }] : []),
  ];
  const chips = [...new Map(data.courses.map((k) => [k.code, k])).values()];
  const ratedCourses = data.courses.filter((k) => k.pressFPct !== null);
  // 7.5: guests see no Education, Publications or the staff-profile note.
  const staff = data.signedIn;
  return (
    <Screen>
      <div className={s.body} style={{ gap: 0, paddingBottom: 0 }}>
        <header className={c.profHead}>
          <Face src={data.face} size={160} name={data.name} priority />
          <h1 className={cx(s.title, "t-mobile-title")}>{data.name}</h1>
          {line ? <p className={c.profLine}>{line}</p> : null}
          {crumbs.length ? (
            <nav aria-label="School and department" className={cx(s.t14, s.soft)}>
              {crumbs.map((k, i) => (
                <Fragment key={k.href}>
                  {i > 0 ? " → " : null}
                  <Link href={k.href} prefetch={false} className={c.profContact}>{k.label}</Link>
                </Fragment>
              ))}
            </nav>
          ) : null}
          {contact.length ? (
            <p className={cx(s.p0, s.t14, s.soft)}>
              {contact.map((k, i) => (
                <Fragment key={k.label}>
                  {i > 0 ? " · " : null}
                  {k.href ? <a href={k.href} className={c.profContact}>{k.label}</a> : k.label}
                </Fragment>
              ))}
            </p>
          ) : null}
          {data.note ? <p className={cx(s.p0, s.t12, s.soft)}>{data.note}</p> : null}
          {sum.enough ? (
            <RatingSummary
              byline={`By ${sum.count} students · all semesters`}
              stats={[
                { value: `${sum.pressFPct}%`, label: "pressed F", tone: "accent" },
                { value: String(chips.length), label: chips.length === 1 ? "course" : "courses" },
                ...(data.years ? [{ value: String(data.years), label: data.years === 1 ? "year here" : "years here" }] : []),
              ]}
              trend={sum.trend.length > 1 ? { title: "Pressed F by semester", delta: trendDelta(sum.trend) ?? undefined, points: sum.trend.map((p) => ({ label: termShort(p.term), value: p.value })) } : undefined}
              tags={sum.tags.map((t) => ({ label: t.tag, pct: t.pct }))}
              byCourse={ratedCourses.map((k) => ({ label: `${k.name} · ${k.roleLabel}`, pct: k.pressFPct! }))}
            />
          ) : (
            <section className={c.fewBox} aria-label="Rating summary">
              <p className={c.fewTitle}>{sum.count ? `New here — ${sum.count} ${sum.count === 1 ? "rating" : "ratings"} so far` : "No ratings yet"}</p>
              <p className={c.fewText}>
                We show the % pressed F from 5 ratings.{data.signedIn ? " Took a class with them? Press F below." : ""}
              </p>
            </section>
          )}
        </header>

        <div className={c.profSections}>
          {data.when.length ? (
            <section className={c.block8}>
              <h2 className={cx(s.section, "t-mobile-section")}>When and where</h2>
              {data.when.map((w) => (
                <div key={`${w.weekday}-${w.time}-${w.code}`} className={c.when}>
                  <p className={c.whenDay}>{w.day}</p>
                  <p className={c.whenTime}>{w.time}</p>
                  <p className={c.whenCourse}>{w.course}</p>
                  <p className={c.whenRoom}>{w.room ?? ""}</p>
                </div>
              ))}
            </section>
          ) : null}
          {chips.length ? (
            <section className={c.block16}>
              <h2 className={cx(s.section, "t-mobile-section")}>Courses</h2>
              <div className={c.layers}>
                {chips.map((k) => (
                  <Chip key={k.code} label={k.name} href={k.href} />
                ))}
              </div>
            </section>
          ) : null}
          {staff && (data.education?.length || data.research) ? (
            <section className={cx(c.block12, c.entryTight)}>
              <h2 className={cx(s.section, "t-mobile-section")}>Education</h2>
              {(data.education ?? []).map((e, i) => (
                <ProfileEntry key={i} title={degreeLine(e)} meta={[e.institution, e.year].filter(Boolean).join(" · ")} />
              ))}
              {data.research ? <ProfileEntry title={data.research} meta="Research area" /> : null}
            </section>
          ) : null}
          {staff && data.publications?.length ? (
            <section className={c.block8}>
              <h2 className={cx(s.section, "t-mobile-section")}>Publications</h2>
              {data.publications.slice(0, 2).map((p, i) => (
                <ProfileEntry key={i} title={p.title} meta={[p.venue, p.year].filter(Boolean).join(" · ")} href={p.url} />
              ))}
              {data.publications.length > 2 ? (
                <details className={c.fold}>
                  <summary className={c.more}>All {data.publications.length} publications</summary>
                  {data.publications.slice(2).map((p, i) => (
                    <ProfileEntry key={i} title={p.title} meta={[p.venue, p.year].filter(Boolean).join(" · ")} href={p.url} />
                  ))}
                </details>
              ) : null}
            </section>
          ) : null}
          {staff ? (
            <p className={cx(s.p0, s.t12, s.soft)} style={{ lineHeight: 1.32 }}>
              From the LMS staff profile. Photos are never shown — faces are drawn.
            </p>
          ) : null}
        </div>
      </div>

      {data.anonymous.latest.length ? (
        <section className={c.band} aria-label="What Anonymous says">
          <h2 className={cx(s.section, "t-mobile-section")}>What Anonymous says · {data.anonymous.count}</h2>
          {data.anonymous.latest.map((m) => (
            <MentionCard key={m.id} m={m} tag="Teacher" />
          ))}
          <MoreMentions kind="teacher" target={data.id} shown={data.anonymous.latest.length} total={data.anonymous.count} variant="mobile" tag="Teacher" className={b.moreButton} />
        </section>
      ) : null}
      {data.signedIn ? (data.rateHref ? <MainButton text={`Press F for ${data.name}`} href={data.rateHref} /> : null) : <MainButton text="Sign in to press F" href={`/sign-in?next=${encodeURIComponent(`/p/${data.id}`)}`} />}
    </Screen>
  );
}
