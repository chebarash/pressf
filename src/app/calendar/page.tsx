import Link from "next/link";
import { Arrow, Tag } from "@/components/ui";
import { activeTerm, calendarHint, countdowns, currentWeek, daysUntil, holidaysIn, semesterProgress, tashkentNow, termWeeks, TERMS, weekTitle, type CalendarWeek, type Countdown, type Term } from "@/lib/calendar";

export const metadata = { title: "Calendar" };
type Props = { searchParams: Promise<{ term?: string }> };

const NAME: Record<Term, string> = { fall: "Fall", spring: "Spring", summer: "Summer" };
const month = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const dayOf = (iso: string) => Number(iso.slice(8, 10));
const day = (iso: string) => `${dayOf(iso)} ${month(iso)}`;
const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
function span(starts: string, ends: string) {
  if (starts === ends) return `${weekday(starts)}, ${day(starts)}`;
  return month(starts) === month(ends) ? `${dayOf(starts)}–${day(ends)}` : `${day(starts)} – ${day(ends)}`;
}

function when(event: Countdown, now: Date) {
  const days = daysUntil(event.starts, now);
  if (days <= 0) return "Now";
  return days === 1 ? "Tomorrow" : `In ${days} days`;
}

function WeekRow({ week, now, today }: { week: CalendarWeek; now: boolean; today: string }) {
  const exam = week.kind === "midterm" || week.kind === "final" || week.kind === "resit_exam";
  const rest = week.kind === "break";
  const past = week.ends < today && !now;
  const days = holidaysIn(week);
  const link = week.kind === "midterm" || week.kind === "final" ? { href: `/files?type=${week.kind}`, text: "Past papers" } : week.kind === "registration" ? { href: "/next-semester", text: "What is next" } : null;
  return (
    <div className={`line-row cal-row ${exam ? "exam" : ""} ${rest ? "rest" : ""} ${past ? "past" : ""} ${now ? "now" : ""}`} aria-current={now ? "date" : undefined}>
      <span className="small num cal-date">{span(week.starts, week.ends)}</span>
      <span className="grow">
        <span className="label" style={{ display: "block" }}>{weekTitle(week)}</span>
        {week.kind === "teaching" && week.note && !/online/i.test(week.note) && <span className="small soft" style={{ display: "block" }}>{week.note}</span>}
        {days.map((item) => <span key={item.date} className="small soft" style={{ display: "block" }}>{weekday(item.date)}, {day(item.date)}: {item.name}</span>)}
      </span>
      {now && <Tag tone="dark">This week</Tag>}
      {!now && !past && link && <Link className="ghost" href={link.href}>{link.text}<Arrow /></Link>}
    </div>
  );
}

export default async function CalendarPage({ searchParams }: Props) {
  const { term: asked } = await searchParams;
  const now = tashkentNow();
  const today = now.toISOString().slice(0, 10);
  const term = TERMS.find((item) => item === asked) ?? activeTerm(now);
  const week = currentWeek(now);
  const progress = semesterProgress(now);
  const hint = calendarHint(now);
  return (
    <div className="wrap section" style={{ maxWidth: 1040 }}>
      <div className="row between" style={{ alignItems: "end" }}>
        <div><h1 className="d-title">Calendar</h1><p className="soft">Academic year 2026–2027, from the official NewUU calendar</p></div>
        <a className="key btn sm" href="/calendar.ics">Add to my calendar</a>
      </div>

      <div className="card" style={{ alignContent: "start" }}>
        <span className="label">{week ? `${NAME[week.term as Term]} semester` : "Between semesters"}</span>
        <h2 className="d-md">{progress ? `Week ${progress.week} of ${progress.total}` : week ? weekTitle(week) : "No classes now"}</h2>
        {progress && <div className="progress" role="img" aria-label={`${progress.week} of ${progress.total} weeks done`}><i style={{ width: `${(progress.week / progress.total) * 100}%` }} /></div>}
        {hint && <p className="soft">{hint.text} <Link className="accent" href={hint.href}>{hint.action}</Link></p>}
      </div>

      <div className="cal-tiles">
        {countdowns(now).map(({ label, event }) => (
          <div key={label} className="card" style={{ alignContent: "start" }}>
            <span className="label-sm soft">{label}</span>
            {event ? (
              <>
                <div className="d-sm">{when(event, now)}</div>
                <div><div className="label">{event.title}</div><div className="small soft">{span(event.starts, event.ends)}</div></div>
                {event.href && <Link className="ghost" href={event.href}>{event.href.startsWith("/files") ? "Past papers" : "What is next"}<Arrow /></Link>}
              </>
            ) : <div className="small soft">Nothing left this year</div>}
          </div>
        ))}
      </div>

      <div className="stack">
        <h2 className="d-md">Week by week</h2>
        <div className="row" style={{ "--gap": "8px" } as React.CSSProperties}>
          {TERMS.map((item) => <Link key={item} className={`chip ${item === term ? "on" : ""}`} href={`/calendar?term=${item}`}>{NAME[item]}</Link>)}
        </div>
        <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
          {termWeeks(term).map((item) => <WeekRow key={item.order} week={item} now={item === week} today={today} />)}
        </div>
        <p className="small soft">Dates can change. The university&apos;s announcements always come first.</p>
      </div>
    </div>
  );
}
