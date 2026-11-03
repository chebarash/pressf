import { dayInfo, nextPhase, teachingWeeks, WEEKS, type CalendarWeek } from "@/core/semester";
import { addDays, clock, localDay, shortDate, weekdayName } from "@/core/time";
import type { ClassView, DeadlineView, ExamView, TodayView } from "@/server/views";

/**
 * The words on the mobile Today screen, worked out from `views.today`. Pure,
 * so every Figma state (2.1–2.13, 10.1) can be tested without rendering.
 */

const now = (v: TodayView) => new Date(v.now);
const info = (v: TodayView) => dayInfo(now(v));

/** "Week 8 of 16", "Week 8 of 16 · midterms", "Break · 21 Dec – 3 Jan". */
export function subtitle(v: TodayView, weeks: CalendarWeek[] = WEEKS): string {
  const i = info(v);
  const week = i.week;
  if (i.holiday) return i.holiday.name;
  if (week?.kind === "break") {
    const phase = nextPhase(now(v), ["break"], weeks);
    // A break runs to the Sunday after its last week.
    return phase ? `Break · ${shortDate(phase.starts)} – ${shortDate(addDays(phase.ends, 2))}` : "Break";
  }
  if ((week?.kind === "midterm" || week?.kind === "final") && week.week) {
    return `Week ${week.week} of ${teachingWeeks(week.term, weeks)} · ${week.kind === "midterm" ? "midterms" : "finals"}`;
  }
  return v.weekLabel ?? "";
}

export const details = (c: Pick<ClassView, "teacher" | "room">) => [c.teacher?.name, c.room].filter(Boolean).join(" · ");

export type Hero = { eyebrow: string; title: string; line?: string; sub?: string };

const examLine = (e: ExamView) => [e.label, e.room].filter(Boolean).join(" · ");

/** "11–15 Jan" or "29 Jan – 2 Feb". */
function days(from: string, to: string) {
  const [a, b] = [shortDate(from), shortDate(to)];
  return a.split(" ")[1] === b.split(" ")[1] ? `${a.split(" ")[0]}–${b}` : `${a} – ${b}`;
}

const isExamWeek = (v: TodayView) => ["midterm", "final"].includes(info(v).week?.kind ?? "");
const isBreak = (v: TodayView) => info(v).week?.kind === "break" || v.state === "break";

/**
 * The big card at the top of the day (Figma 2.3–2.6), or null when the class
 * list says it all.
 */
export function hero(v: TodayView, weeks: CalendarWeek[] = WEEKS): Hero | null {
  const at = now(v);
  if (isBreak(v)) {
    const phase = nextPhase(at, ["break"], weeks);
    const back = phase ? addDays(phase.ends, 3) : null;
    const exams = nextPhase(at, ["final", "midterm"], weeks);
    const after = back ? weeks.find((w) => w.starts >= back) : undefined;
    const month = localDay(at).slice(5, 7);
    return {
      eyebrow: month === "12" || month === "01" ? "Winter break" : "Break",
      title: back ? `Until ${shortDate(back)}` : "Break",
      line: exams ? `${exams.title} ${days(exams.starts, exams.ends)}` : undefined,
      sub: after ? (/revision/i.test(after.note ?? "") ? `Revision week starts ${shortDate(after.starts)}` : `Classes resume ${shortDate(after.starts)}`) : undefined,
    };
  }

  if (isExamWeek(v)) {
    const [first, ...rest] = v.examsThisWeek;
    if (first)
      return {
        eyebrow: "Your exams this week",
        title: `${first.dayLabel} ${first.time}`,
        line: examLine(first),
        sub: rest.map((e) => `${e.dayLabel} ${e.time} · ${examLine(e)}`).join("\n") || undefined,
      };
  }

  const upcoming = (eyebrow: string): Hero =>
    v.upcoming
      ? { eyebrow, title: v.upcoming.label, line: v.upcoming.class.name, sub: details(v.upcoming.class) || undefined }
      : { eyebrow, title: "Nothing planned", sub: "No classes in your timetable yet" };

  if (v.state === "over") return upcoming("Classes are over");
  if (v.state === "holiday") return upcoming(info(v).holiday?.name ?? "Holiday");
  if (v.state === "weekend" || v.state === "free" || v.state === "exams") return upcoming("No classes today");
  return null;
}

/** Class rows show unless the day is over (the hero says what is next). */
export const showClasses = (v: TodayView) => v.classes.length > 0 && v.state !== "over" && !isBreak(v);

export type Tile = { id: "timetable" | "progress" | "calendar" | "courses" | "qr"; title: string; sub: string; tone: "default" | "warn" | "accent"; href: string };

export function tiles(v: TodayView): Tile[] {
  const t = v.tiles;
  const a = t.absences;
  return [
    { id: "timetable", title: "Timetable", sub: t.nextClass ? `Next ${t.nextClass}` : "This week", tone: "default", href: "/timetable" },
    {
      id: "progress",
      title: "Progress",
      sub: a ? (a.left === 0 ? "No absences left" : `${a.left} ${a.left === 1 ? "absence" : "absences"} left`) : "Grades",
      tone: a && a.left <= 2 ? "warn" : "default",
      href: a && a.left <= 2 ? `/progress/${encodeURIComponent(a.courseId)}` : "/progress",
    },
    { id: "calendar", title: "Calendar", sub: t.exam?.label ?? v.weekLabel ?? "Semester", tone: "default", href: "/calendar" },
    { id: "courses", title: "Courses", sub: `${t.courses} this term`, tone: "default", href: "/courses" },
    { id: "qr", title: "Scan QR", sub: t.qrOpen ? "In class now" : "Attendance", tone: t.qrOpen ? "accent" : "default", href: "/qr" },
  ];
}

/** The class a QR check-in would count for right now, if any. */
export const checkInClass = (v: TodayView) => (v.tiles.qrOpen ? (v.current ?? v.next) : null);

export const dueLate = (d: DeadlineView) => d.status === "todo" || d.status === "missed";

/** The "Next exams" card outside exam and break weeks. */
export function nextExamCard(v: TodayView) {
  if (isExamWeek(v) || isBreak(v)) return null;
  const e = v.nextExams[0];
  if (!e) return null;
  const start = new Date(e.start);
  return { title: weekdayName(start), line: e.label, sub: [shortDate(start), clock(start), e.room].filter(Boolean).join(" · ") };
}

/** On Today the feed shows unread items; with none it says "all caught up" (Figma 2.12). */
export const caughtUp = (v: TodayView) => v.notifications.items.length > 0 && v.notifications.unread === 0;
/** The latest four items, unread first; read ones stay, without the dot (Figma 2.1). */
export const todayFeed = (v: TodayView) => [...v.notifications.items.filter((i) => !i.read), ...v.notifications.items.filter((i) => i.read)].slice(0, 4);
/** The view holds the latest four; a shorter list is everything, so no "All" (Figma 2.5). */
export const feedHasMore = (v: TodayView) => v.notifications.items.length >= 4;

/** "2 COURSES WAITING · 30 SECONDS · ANONYMOUS". */
export const ratingEyebrow = (n: number) => `${n} ${n === 1 ? "course" : "courses"} waiting · 30 seconds · anonymous`;

/** "Discrete Mathematics with Sardor Karimov and Programming 2 with Emily Carter. …" */
export function ratingBody(courses: Array<{ name: string; teacher?: string }>) {
  const parts = courses.slice(0, 3).map((c) => (c.teacher ? `${c.name} with ${c.teacher}` : c.name));
  const more = courses.length - parts.length;
  const list = more > 0 ? `${parts.join(", ")} and ${more} more` : parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
  return `${list}. Your rating is what next year's students choose by.`;
}

/** The rating ask as the screen shows it, or null when nothing waits. */
export function ratingAsk(v: TodayView) {
  const r = v.rating;
  if (r.level === "none" || !r.term || !r.waiting.length) return null;
  return { term: r.term, level: r.level, courses: r.waiting.map((w) => ({ name: w.name, teacher: w.teachers[0]?.name })) };
}

export type RatingAskView = NonNullable<ReturnType<typeof ratingAsk>>;
