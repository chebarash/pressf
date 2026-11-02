import type { ProfessorView } from "@/server/views";
import { Chip, ExternalIcon, Face, RatingSummary, SendIcon, Tag } from "./mc/kit";
import { MainButton } from "./mc/client";
import { cx, Screen } from "./mc/parts";
import { termShort, trendDelta } from "./mc/format";
import s from "./mc/mc.module.css";
import c from "./mc/screens.module.css";

const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Tashkent" }) : "");

/** Mobile Professor (Figma 7.4, 7.5 guest, 7.9 few ratings). Faces are drawn, never photos. */
export default function Professor({ data }: { data: ProfessorView }) {
  const sum = data.summary;
  const line = [data.position, data.department, data.school].filter(Boolean).join(" · ");
  const chips = [...new Map(data.courses.map((k) => [k.code, k])).values()];
  const ratedCourses = data.courses.filter((k) => k.pressFPct !== null);
  return (
    <Screen>
      <div className={s.body} style={{ gap: 0, paddingBottom: 0 }}>
        <header className={c.profHead}>
          <Face size={160} name={data.name} priority />
          <h1 className={cx(s.title, "t-mobile-title")}>{data.name}</h1>
          {line ? <p className={c.profLine}>{line}</p> : null}
          {sum.enough ? (
            <RatingSummary
              byline={`By ${sum.count} students · all semesters`}
              stats={[
                { value: `${sum.pressFPct}%`, label: "pressed F", tone: "accent" },
                { value: String(chips.length), label: chips.length === 1 ? "course" : "courses" },
              ]}
              trend={sum.trend.length > 1 ? { title: "Pressed F by semester", delta: trendDelta(sum.trend) ?? undefined, points: sum.trend.map((p) => ({ label: termShort(p.term), value: p.value })) } : undefined}
              tags={sum.tags.map((t) => ({ label: t.tag, pct: t.pct }))}
              byCourse={ratedCourses.map((k) => ({ label: `${k.name} · ${k.roleLabel}`, pct: k.pressFPct! }))}
            />
          ) : (
            <section className={c.fewBox} aria-label="Rating summary">
              <p className={c.fewTitle}>{sum.count ? `New here — ${sum.count} ${sum.count === 1 ? "rating" : "ratings"} so far` : "No ratings yet"}</p>
              <p className={cx(s.t12, s.soft)} style={{ lineHeight: 1.32 }}>
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
          {data.signedIn ? (
            <p className={cx(s.p0, s.t12, s.soft)} style={{ lineHeight: 1.32 }}>
              From the LMS staff profile. Photos are never shown — faces are drawn.
            </p>
          ) : null}
        </div>
      </div>

      {data.anonymous.latest.length ? (
        <section className={c.band} aria-label="What Anonymous says">
          <h2 className={cx(s.section, "t-mobile-section")}>What Anonymous says</h2>
          {data.anonymous.latest.map((m) => (
            <a key={m.id} href={m.url} target="_blank" rel="noreferrer" className={c.mention}>
              <span className={c.mentionHead}>
                <SendIcon size={16} aria-hidden />
                <span className={s.t13m}>Anonymous</span>
                <span className={cx(s.t14, s.soft)}>{dateOf(m.date)}</span>
              </span>
              <p className="t-body-md">{m.text.length > 220 ? `${m.text.slice(0, 217)}…` : m.text}</p>
              <span className={c.mentionFoot}>
                <Tag>Teacher</Tag>
                <span className={s.t13m}>Open post</span>
                <ExternalIcon size={14} aria-hidden />
              </span>
            </a>
          ))}
        </section>
      ) : null}
      {data.signedIn ? <MainButton text={`Press F for ${data.name}`} href="/rate" /> : <MainButton text="Sign in to press F" href={`/sign-in?next=${encodeURIComponent(`/p/${data.id}`)}`} />}
    </Screen>
  );
}
