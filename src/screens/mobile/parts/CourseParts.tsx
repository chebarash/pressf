import Link from "next/link";
import { MIN_RATINGS } from "@/core/ratings";
import { cx, Disclosure, Face, pctTier, RatingStrip, RatingSummary, Score, Tag } from "@/ui/components";
import { ChevronRightIcon, ClockIcon, ExternalIcon, SendIcon } from "@/ui/icons";
import s from "./Course.module.css";
import type { MentionView, RatingSummaryView, SyllabusFold, TeacherCard as TeacherCardView, YouInCourse } from "../views";

const shortTerm = (t: string) => `${t[0]}${t.match(/\d{2}(\d{2})/)?.[1] ?? ""}`;

/** Header stickers (App/RatingStrip); nothing under MIN_RATINGS. */
export function CourseRatingStrip({ summary }: { summary: RatingSummaryView }) {
  if (!summary.enough) return null;
  return (
    <RatingStrip
      href="#ratings"
      recommend={{ pct: summary.recommendPct }}
      hours={summary.hours}
      difficulty={summary.difficulty !== null && summary.difficultyLabel ? { value: summary.difficulty, word: summary.difficultyLabel } : null}
    />
  );
}

/** App/RatingSummary filled from the course summary. */
export function CourseRatingSummary({ summary }: { summary: RatingSummaryView }) {
  if (!summary.enough) return null;
  const span = summary.since ? ` · ${summary.since}${summary.until && summary.until !== summary.since ? ` – ${summary.until}` : ""}` : "";
  return (
    <div id="ratings" className={s.anchor}>
      <RatingSummary
        byline={`By ${summary.count} students${span}`}
        stats={[
          { value: `${summary.recommendPct}%`, label: "recommend", tone: "accent" },
          { value: summary.hours === null ? "—" : `${Math.round(summary.hours)} h`, label: "a week" },
          { value: summary.difficulty === null ? "—" : `${Math.round(summary.difficulty)}/5`, label: summary.difficultyLabel?.toLowerCase() ?? "difficulty", tone: "low" },
        ]}
        trend={
          summary.trend.length > 1
            ? {
                title: "Recommend by semester",
                delta: summary.delta ? `${summary.delta > 0 ? "↑" : "↓"} ${Math.abs(summary.delta)} since ${shortTerm(summary.trend[0].term)}` : undefined,
                points: summary.trend.map((p) => ({ label: shortTerm(p.term), value: p.value })),
              }
            : undefined
        }
        tags={summary.tags.map((t) => ({ label: t.tag, pct: t.pct }))}
      />
    </div>
  );
}

export function YouCard({ you }: { you: YouInCourse }) {
  if (you.status === "took") {
    const line = [you.ects ? `${you.ects} ECTS` : null, you.teacher].filter(Boolean).join(" · ");
    return (
      <div className={cx(s.you, s.youPlain)}>
        <div className={s.youTop}>
          <Score value={you.mark === null ? "—" : String(Math.round(you.mark))} tier={pctTier(you.mark)} label={`Your result ${you.mark ?? "not graded"}`} />
          <span className={s.youBody}>
            <span className={s.youTitle}>{you.mark === null ? `You took it in ${you.term}` : `Your result: ${Math.round(you.mark)}${you.passed === null ? "" : you.passed ? ", passed" : ", not passed"}`}</span>
            {line ? <span className={s.youSub}>{line}</span> : null}
          </span>
        </div>
      </div>
    );
  }
  const score = you.mark ?? you.average;
  const line = [
    you.average !== null ? `Average ${Math.round(you.average)}` : null,
    you.rating !== null ? `rating ${Math.round(you.rating)}` : null,
    you.absences ? `absences ${you.absences.missed} of ${you.absences.limit}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link href={`/progress/${you.courseId}`} className={s.you} prefetch>
      <span className={s.youTop}>
        <Score value={score === null ? "—" : String(Math.round(score))} tier={pctTier(score)} label={`Average ${score ?? "not graded yet"}`} />
        <span className={s.youBody}>
          <span className={s.youTitle}>You in this course</span>
          {line ? <span className={s.youSub}>{line}</span> : null}
        </span>
        <ChevronRightIcon size={18} />
      </span>
      {you.next ? (
        <span className={s.youNext}>
          Next: {you.next.title} · {you.next.dueLabel}
        </span>
      ) : null}
    </Link>
  );
}

export function FewRatings({ count }: { count: number }) {
  return (
    <div className={s.few}>
      <h2 className={s.fewTitle}>Not enough ratings yet</h2>
      <p className={s.fewText}>
        {count === 0 ? "No one has rated it yet" : `${count} ${count === 1 ? "student" : "students"} rated it`} — we show numbers from {MIN_RATINGS}, so one person can&apos;t skew it.
      </p>
    </div>
  );
}

export function TeacherCard({ t }: { t: TeacherCardView }) {
  return (
    <Link href={t.href} className={s.teacher} prefetch>
      <Face src={t.face} size={96} />
      <span className={s.teacherBody}>
        <span className={s.teacherName}>{t.name}</span>
        <span className={s.teacherLine}>
          {t.roleLabel}
          {t.pressFPct !== null ? ` · ${t.pressFPct}% pressed F` : ""}
        </span>
        {t.when ? (
          <span className={s.slot}>
            <ClockIcon size={16} />
            {t.when}
          </span>
        ) : null}
        {t.topTag ? <Tag>{t.topTag}</Tag> : null}
      </span>
    </Link>
  );
}

function Fold({ title, sub, open, down, children }: { title: string; sub: string | null; open?: boolean; down?: boolean; children: React.ReactNode }) {
  return (
    <Disclosure
      className={s.fold}
      headClassName={s.foldHead}
      bodyClassName={s.foldBody}
      defaultOpen={open}
      chevron={down ? "down" : "right"}
      summary={
        <span className={s.foldText}>
          <span className={s.foldTitle}>{title}</span>
          {sub ? <span className={s.foldSub}>{sub}</span> : null}
        </span>
      }
    >
      {children}
    </Disclosure>
  );
}

/** Syllabus, folded: grading open, the rest one tap away; books search Press F, prerequisites link to their courses. */
export function Syllabus({ syl }: { syl: SyllabusFold }) {
  const workload = [syl.ects ? `${syl.ects} ECTS` : null, syl.totalHours ? `${syl.totalHours} hours` : null, syl.hoursPerWeek ? `about ${syl.hoursPerWeek} a week` : null].filter(Boolean).join(" · ");
  const needs = syl.prerequisites.needs.map((n) => n.text);
  const prereq =
    syl.prerequisites.status === "none" && !syl.prerequisites.unlocks.length
      ? "No prerequisites"
      : [needs.length ? `Needs ${needs.join(", ")}` : null, syl.prerequisites.unlocks.length ? `unlocks ${syl.prerequisites.unlocks.map((u) => u.name).join(", ")}` : null].filter(Boolean).join(" · ");
  return (
    <div className={s.syllabus}>
      {syl.grading.length ? (
        <Fold title="Grading" sub="From the course syllabus" open down>
          {syl.grading.map((g) => (
            <div key={g.name} className={s.assess}>
              <span className={s.assessPct}>{g.weight === null ? "—" : `${g.weight}%`}</span>
              <span>
                <span className={s.assessName}>{g.name}</span>
                <span className={s.assessNote}>{g.timing ?? "Date to be announced"}</span>
              </span>
            </div>
          ))}
        </Fold>
      ) : null}
      {workload || syl.attendancePolicy ? (
        <Fold title="Credits and workload" sub={workload || null}>
          {syl.description ? <p className={s.assessNote}>{syl.description}</p> : null}
          {syl.attendancePolicy ? <p className={s.assessNote}>Attendance: {syl.attendancePolicy}</p> : null}
        </Fold>
      ) : null}
      {syl.outcomes.length ? (
        <Fold title="What you'll learn" sub={`${syl.outcomes.length} ${syl.outcomes.length === 1 ? "outcome" : "outcomes"}`}>
          <ol className={s.outcomes}>
            {syl.outcomes.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ol>
        </Fold>
      ) : null}
      {syl.books.length ? (
        <Fold title="Books" sub={`${syl.books.length} ${syl.books.length === 1 ? "book" : "books"}`}>
          {syl.books.map((bk) => (
            <Link key={bk.title} href={`/search?q=${encodeURIComponent(bk.title)}`} className={s.book} prefetch={false}>
              <span className={s.foldText}>
                <span className={s.foldTitle}>{bk.title}</span>
                <span className={s.foldSub}>
                  {bk.authors}
                  {bk.kind === "recommended" ? " · recommended" : ""}
                </span>
              </span>
              <ChevronRightIcon size={18} />
            </Link>
          ))}
        </Fold>
      ) : null}
      {prereq ? (
        <Fold title="Prerequisites" sub={prereq}>
          {[...syl.prerequisites.needs.filter((n) => n.code).map((n) => ({ code: n.code!, name: n.text, how: "Needs" })), ...syl.prerequisites.unlocks.map((u) => ({ code: u.code, name: u.name, how: "Unlocks" }))].map((c) => (
            <Link key={`${c.how}${c.code}`} href={`/c/${c.code}`} className={s.book} prefetch={false}>
              <span className={s.foldText}>
                <span className={s.foldTitle}>{c.name}</span>
                <span className={s.foldSub}>
                  {c.how} · {c.code}
                </span>
              </span>
              <ChevronRightIcon size={18} />
            </Link>
          ))}
        </Fold>
      ) : null}
    </div>
  );
}

const longDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Tashkent" }) : null);

export function MentionCard({ m, tag = "Course" }: { m: MentionView; tag?: string }) {
  // Figma MentionCard: the whole card opens the post; footer is Tag · "Open post" · external icon, spread apart.
  return (
    <a href={m.url} className={s.mention} target="_blank" rel="noreferrer">
      <span className={s.mentionHead}>
        <span className={s.mentionWho}>
          <SendIcon size={16} />
          Anonymous
        </span>
        {m.date ? <span className={s.mentionDate}>{longDate(m.date)}</span> : null}
      </span>
      <span className={s.mentionText}>{m.text}</span>
      <span className={s.mentionFoot}>
        <Tag>{tag}</Tag>
        <span className={s.openPost}>Open post</span>
        <ExternalIcon size={14} />
      </span>
    </a>
  );
}

/** Signed-out notice where the gated sections start (4.6). */
export function GateNotice() {
  return (
    <div className={s.gate}>
      <p className={s.gateTitle}>Syllabus, weekly files and grading</p>
      <p className={s.gateText}>Students see these after signing in with LMS. Ratings and Anonymous stay open to everyone.</p>
    </div>
  );
}

/**
 * The week list's shape for guests, drawn blurred under the gate (4.6): week rows,
 * this week with two file rows, the links. No real course data is sent to guests.
 */
export function GhostWeeks() {
  const row = (n: number, w: number, now = false) => (
    <div className={cx(s.weekRow, now && s.weekNow)}>
      <span className={s.weekNum}>{n}</span>
      <span className={s.weekTopic}>
        <span className={s.ghostBar} style={{ display: "inline-block", width: w, verticalAlign: "middle" }} />
      </span>
    </div>
  );
  const file = (flag: string) => (
    <div className={s.ghostFile}>
      <span className={s.ghostFlag} style={{ background: flag }} />
      <span className={s.ghostItem}>
        <span className={s.ghostBar} style={{ width: 150 }} />
        <span className={s.ghostBar} style={{ width: 70, height: 10 }} />
      </span>
    </div>
  );
  return (
    <>
      {row(7, 230)}
      <div className={s.week}>
        {row(8, 120, true)}
        <div className={s.weekFiles}>
          {file("var(--bg-accent)")}
          {file("var(--mustard-500)")}
        </div>
      </div>
      {row(9, 240)}
      <div className={s.links}>
        <span className={s.ghost}>
          <span className={s.ghostBar} style={{ width: 110 }} />
        </span>
        <span className={s.ghost}>
          <span className={s.ghostBar} style={{ width: 90 }} />
        </span>
      </div>
    </>
  );
}
