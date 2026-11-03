/**
 * View model (src/server/views) → what the desktop frames draw (./model).
 * Pure functions: no fetching, no React. One per screen.
 */
import { COURSE_TAGS } from "@/core/ratings";
import { tier } from "@/core/grades";
import { weekOf } from "@/core/semester";
import { addDays, localDay, localMinutes, toLocal } from "@/core/time";
import type * as V from "@/server/views";
import type { RatingSummaryProps } from "@/ui/components";
import type * as M from "./model";

const TZ = "Asia/Tashkent";
const join = (...parts: Array<string | number | null | undefined | false>) => parts.filter((p) => p !== null && p !== undefined && p !== false && p !== "").join(" · ");
const KIND_LABEL: Record<string, string> = { lecture: "Lecture", practice: "Practice", lab: "Lab", exam: "Exam", other: "Class" };
/** "Fall 2024" → "F24". */
const shortTerm = (term: string) => term.replace(/^(Fall|Spring|Summer)\s+\d{2}(\d{2})$/, (_, s: string, y: string) => `${s[0]}${y}`);

export const fileRow = (f: V.FileItem, course?: string): M.FileRowData => ({ id: f.id, title: f.title, type: f.type, date: f.dateLabel, source: f.source, from: f.from, href: f.href, course });

function feedItem(f: V.FeedView, section?: string): M.FeedItemVM {
  return {
    id: f.id,
    kind: f.kind,
    title: f.title,
    // D7 / D1: "LMS · Calculus 1 · 1 h ago · needs your OK"; the author shows when no course is named.
    meta: join(SOURCE[f.kind], f.courseName ?? f.author, f.ago, f.needsAck && !f.read && "needs your OK"),
    unread: !f.read,
    href: `/notifications?open=${encodeURIComponent(f.id)}`,
    section,
    // "LMS announcement · Calculus 1 · Gonçalo Pinto · 1 h ago".
    eyebrow: join(KIND_EYEBROW[f.kind], f.courseName, f.author, f.ago),
    body: f.body ? f.body.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean) : [],
    needsAck: f.needsAck,
    open: f.href ? { label: f.courseName ? `Open ${f.courseName}` : "Open", href: f.href } : null,
  };
}
const SOURCE: Record<string, string> = { announcement: "LMS", anonymous: "Anonymous" };
const KIND_EYEBROW: Record<string, string> = { announcement: "LMS announcement", grade: "New grade", absence: "Absence", file: "New files", deadline: "Deadline", anonymous: "Anonymous", upload: "Your upload", system: "Press F" };

function summaryProps(r: V.RatingSummaryView, title: string): RatingSummaryProps | null {
  if (!r.enough) return null;
  const range = r.since && r.until && r.since !== r.until ? `${r.since} – ${r.until}` : r.since;
  const stats: RatingSummaryProps["stats"] = [{ value: `${r.recommendPct}%`, label: "recommend", tone: "accent" }];
  if (r.hours != null) stats.push({ value: `${Math.round(r.hours)} h`, label: "a week" });
  if (r.difficulty != null) stats.push({ value: `${Math.round(r.difficulty)}/5`, label: "hard", tone: "low" });
  return {
    byline: join(`By ${r.count} students`, range),
    stats,
    trend: r.trend.length > 1 ? { title, delta: r.delta != null ? `${r.delta >= 0 ? "↑" : "↓"} ${Math.abs(r.delta)} since ${shortTerm(r.trend[0].term)}` : undefined, points: r.trend.map((p) => ({ label: shortTerm(p.term), value: p.value })) } : undefined,
    tags: r.tags.map((t) => ({ label: t.tag, pct: t.pct })),
  };
}
const strip = (r: V.RatingSummaryView | null | undefined): M.Strip =>
  r?.enough ? { recommendPct: r.recommendPct, hours: r.hours, difficulty: r.difficulty, difficultyWord: r.difficultyLabel } : { recommendPct: null, hours: null, difficulty: null, difficultyWord: null };

const card = (c: V.CourseCard): M.CourseCardVM => ({ code: c.code, name: c.name, href: c.href, recommendPct: c.recommendPct, teacher: c.teacher ? { name: c.teacher.name, face: c.teacher.face ?? null } : null, line: c.when ?? "" });

/* ---------- Today ---------- */

/** "Fall 2026" for the semester running on `now` (Figma D9 "When and where · Fall 2026"). */
const termName = (now: Date) => {
  const w = weekOf(localDay(now));
  if (!w || w.term === "summer") return null;
  const year = Number(w.starts.slice(0, 4));
  // Fall runs into January: those weeks still belong to the autumn's year.
  return w.term === "fall" ? `Fall ${Number(w.starts.slice(5, 7)) < 8 ? year - 1 : year}` : `Spring ${year}`;
};
const ROLE_ONE: Record<string, string> = { lecture: "Lecture", tutorial: "Tutorial", lab: "Lab", practice: "Practice", other: "" };

export function today(v: V.TodayView): M.TodayData {
  const now = new Date(v.now);
  const hour = toLocal(now).getUTCHours();
  const dateLine = join(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now).replace(",", ""), v.weekLabel);
  const cls = v.current ?? v.next ?? v.upcoming?.class ?? null;
  let label = "";
  if (v.current) label = `Now · until ${v.current.endTime}`;
  else if (v.next) {
    const mins = Math.round((Date.parse(v.next.start) - now.getTime()) / 60_000);
    label = mins <= 90 ? `Next · starts in ${mins} min` : `Next · ${v.next.time}`;
  } else if (v.upcoming) label = `Next · ${v.upcoming.label}`;

  const day = [
    ...v.classes.map((c) => ({ at: c.start, time: c.time, title: c.name, meta: join(c.room, c.changedFrom ? `moved from ${c.changedFrom}` : KIND_LABEL[c.kind]), tone: (c.status === "now" || c.status === "next" ? "next" : "class") as "next" | "class", href: c.courseId ? `/c/${c.code}` : undefined })),
    ...v.dueSoon.filter((d) => localDay(new Date(d.due)) === localDay(now)).map((d) => ({ at: d.due, time: new Date(d.due).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }), title: d.title, meta: join(d.course, d.statusLabel), tone: "deadline" as const, href: undefined })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const before = day.findIndex((d) => d.at > v.now);
  const nowTime = now.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const exam = v.nextExams[0] ?? v.examsThisWeek[0] ?? null;
  const absences = v.tiles.absences;
  const b = v.banner;
  const at = v.sync.syncedAt ? new Date(v.sync.syncedAt).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) : null;
  return {
    // D15: "hero.study isn't answering. You're seeing what we had at 08:40 — grades and files may be a bit behind."
    banner: b
      ? {
          text: b.kind === "lms-down" && at ? `hero.study isn't answering. You're seeing what we had at ${at} — grades and files may be a bit behind.` : b.text,
          tone: b.kind === "lms-down" || b.kind === "sign-in" ? "warning" : "info",
          action: b.action ? { label: b.action.label, href: b.action.href ?? "/" } : null,
        }
      : null,
    greeting: (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening") + (v.firstName ? `, ${v.firstName}` : ""),
    title: v.title,
    dateLine,
    next: cls
      ? {
          label,
          title: cls.name,
          line: join(`${cls.time}–${cls.endTime}`, cls.room, cls.teacher?.name, KIND_LABEL[cls.kind]),
          href: `/c/${cls.code}`,
          files: v.materials.map((f) => fileRow(f)),
          note: join(absences ? `${absences.name}: ${absences.left} absences left` : null, v.tiles.qrOpen && "QR check-in is on your phone"),
        }
      : null,
    day: day.map(({ at: _at, ...rest }) => rest),
    now: day.length ? { time: nowTime, before: before < 0 ? day.length : before } : null,
    feed: { unread: v.notifications.unread, items: v.notifications.items.slice(0, 4).map((f) => feedItem(f)) },
    due: v.dueSoon.slice(0, 3).map((d) => ({ title: d.title, meta: join(d.course, d.dueLabel), status: d.statusLabel, late: d.status === "todo" || d.status === "missed" })),
    exam: exam ? { when: exam.dayLabel, title: exam.label, meta: join(exam.time, exam.room) } : null,
    courses: v.courses.map(card),
    rate:
      v.rating.level !== "none" && v.rating.waiting.length
        ? { eyebrow: `${v.rating.waiting.length} course${v.rating.waiting.length === 1 ? "" : "s"} · 30 seconds`, title: `Rate ${v.rating.term ?? "last semester"}`, text: "Next year's students choose by this. Anonymous.", href: "/rate", term: v.rating.term }
        : null,
  };
}

/* ---------- Timetable ---------- */

const TONE: Record<string, M.ClassTone> = { lecture: "teal", practice: "teal", lab: "plum", exam: "rust", other: "moss" };

export function timetable(v: V.TimetableView, now = new Date()): M.TimetableData {
  const index = new Map(v.week.map((d, i) => [d.day, i]));
  const exam = /midterm/i.test(v.weekLabel ?? "") ? "MIDTERM" : /final/i.test(v.weekLabel ?? "") ? "FINAL" : "EXAM";
  // D3: the whole week from `weekClasses`; the selected day's classes carry the inspector extras (materials, absences, lesson).
  const detailed = new Map(v.classes.map((c) => [c.key, c]));
  const week = v.weekClasses?.length ? v.weekClasses.filter((c) => index.has(localDay(new Date(c.start)))) : v.classes;
  const classes = week.map((base): M.TimetableClass => {
    const c: V.ClassView & Partial<Pick<V.TimetableClass, "lesson" | "materials" | "absences">> = detailed.get(base.key) ?? base;
    const start = new Date(c.start);
    return {
      id: c.key,
      day: index.get(localDay(start)) ?? 0,
      start: localMinutes(start),
      end: localMinutes(new Date(c.end)),
      title: c.kind === "exam" ? `${c.name} · ${exam}` : c.name,
      meta: c.kind === "exam" ? join(`${c.time}–${c.endTime}`, c.room) : join(c.time, c.room, c.changedFrom ? "moved" : KIND_LABEL[c.kind]),
      tone: c.changedFrom ? "mustard" : (TONE[c.kind] ?? "moss"),
      tags: [c.code, c.lesson ?? KIND_LABEL[c.kind]].filter(Boolean) as string[],
      when: `${new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(start)} · ${c.time}–${c.endTime}`,
      room: c.room ? join(c.room, c.changedFrom && `moved from ${c.changedFrom}`) : null,
      teacher: c.teacher ? join(c.teacher.name, KIND_LABEL[c.kind]?.toLowerCase()) : null,
      files: (c.materials ?? []).map((f) => fileRow(f)),
      absences: c.absences ? { line: `Absences in this course: ${c.absences.missed} of ${c.absences.limit}`, left: `${c.absences.left} left` } : null,
      href: `/c/${c.code}`,
    };
  });
  const weekLoaded = !!v.weekClasses?.length;
  const selectedIdx = index.get(v.day) ?? -1;
  const starts = classes.map((c) => c.start);
  const ends = classes.map((c) => c.end);
  const startHour = Math.min(9, ...starts.map((m) => Math.floor(m / 60)));
  const endHour = Math.max(20, ...ends.map((m) => Math.ceil(m / 60)));
  const todayIdx = v.week.findIndex((d) => d.today);
  const monday = v.week[0]?.day ?? v.day;
  return {
    weekLabel: join(v.weekLabel, v.week.length ? `${v.week[0].date} – ${v.week[v.week.length - 1].date}` : null),
    prevHref: `/timetable?day=${addDays(monday, -7)}`,
    nextHref: `/timetable?day=${addDays(monday, 7)}`,
    todayHref: "/timetable",
    days: v.week.map((d) => ({ label: `${d.label} ${d.date.split(" ")[0]}`, today: d.today, href: `/timetable?day=${d.day}`, count: d.classes, loaded: weekLoaded || d.selected })),
    startHour,
    endHour,
    now: todayIdx >= 0 ? { day: todayIdx, minutes: localMinutes(now) } : null,
    classes,
    selected: (() => {
      const onDay = classes.filter((c) => c.day === selectedIdx);
      const pool = onDay.length ? onDay : classes;
      return (v.day === localDay(now) ? pool.find((c) => c.end >= localMinutes(now)) : undefined)?.id ?? pool[0]?.id ?? null;
    })(),
    empty: v.holiday ? `${v.holiday.name} · no classes` : !classes.length && v.nextClass ? `No classes. Next: ${v.nextClass.label}, ${v.nextClass.class.name}${v.nextClass.class.room ? ` in ${v.nextClass.class.room}` : ""}.` : null,
  };
}

/* ---------- Courses ---------- */

const listItem = (c: V.CourseCard): M.CourseListItem => ({ code: c.code, name: c.name, href: c.href, recommendPct: c.recommendPct, next: c.when ? `Next: ${c.when}` : "", absences: null });

export function myCourses(v: V.MyCoursesView): M.CoursesData {
  return {
    terms: [{ id: "now", label: "Now", href: "/courses", active: true }, ...v.earlier.map((e) => ({ id: e.term, label: shortTerm(e.term).replace(/^([FS])(\d+)$/, (_, s: string, y: string) => `${s === "F" ? "Fall" : "Spring"} ${y}`), href: `/courses?term=${encodeURIComponent(e.term)}`, active: false }))],
    courses: v.courses.map(listItem),
    cards: v.courses.map(card),
    note: v.notInLmsYet ? "The registrar hasn't published the new semester in the LMS yet." : null,
  };
}

export function course(v: V.CourseView): M.CourseData {
  const status = v.termStatus === "now" ? " · Now" : v.termStatus === "took" ? " · You took it" : "";
  const weeks = v.weeks ?? [];
  const cur = Math.max(0, weeks.findIndex((w) => w.current));
  const shown = weeks.slice(Math.max(0, cur - 1), cur + 2);
  const s = v.syllabus;
  const syllabus: M.CourseData["syllabus"] = [];
  if (s) {
    if (s.ects != null || s.totalHours != null) syllabus.push({ title: "Credits and workload", meta: join(s.ects != null && `${s.ects} ECTS`, s.totalHours != null && `${s.totalHours} hours`, s.hoursPerWeek != null && `about ${s.hoursPerWeek} a week`) });
    if (s.outcomes.length) syllabus.push({ title: "What you'll learn", meta: `${s.outcomes.length} outcomes` });
    if (s.books.length) syllabus.push({ title: "Books", meta: `${s.books.length} book${s.books.length === 1 ? "" : "s"}` });
    if (s.prerequisites.status !== "not_stated")
      syllabus.push({ title: "Prerequisites", meta: join(s.prerequisites.needs.length ? `Needs ${s.prerequisites.needs.map((n) => n.text).join(", ")}` : "None", s.prerequisites.unlocks.length && `unlocks ${s.prerequisites.unlocks.map((u) => u.name).join(", ")}`) });
  }
  const you = v.you;
  const mention = v.anonymous.latest[0];
  return {
    code: v.code,
    name: v.name,
    kind: null,
    term: { label: v.term ? `${v.term.term}${status}` : "All semesters", options: v.terms.map((t) => ({ label: t.current ? `${t.term} · Now` : t.term, href: `/c/${v.code}?term=${encodeURIComponent(t.term)}` })) },
    strip: strip(v.ratings),
    tabs: { overview: "Overview", files: v.files?.all ?? 0, anonymous: v.anonymous.count, filesHref: `/c/${v.code}/files`, anonymousHref: `/c/${v.code}/anonymous` },
    weeks: shown.map((w) => ({ n: w.week ?? 0, title: w.topic ?? "—", current: w.current, files: w.files.map((f) => fileRow(f)) })),
    weeksTotal: v.totalWeeks,
    filesTotal: v.files?.all ?? 0,
    teachers: v.teachers.map((t) => ({ id: t.id, name: t.name, face: t.face ?? null, href: t.href, line: join(t.roleLabel, t.when), pressFPct: t.pressFPct })),
    grading: (s?.grading ?? []).filter((g) => g.weight != null).map((g) => ({ pct: g.weight!, title: g.name, note: g.timing ?? "" })),
    syllabus,
    me:
      you?.status === "now"
        ? {
            average: you.mark ?? you.average,
            tier: tier(you.mark ?? you.average),
            line: join(you.average != null && `Average ${you.average}`, you.rating != null && `rating ${you.rating}`, you.absences && `absences ${you.absences.missed} of ${you.absences.limit}`),
            next: you.next ? `Next: ${you.next.title} · ${you.next.dueLabel}` : null,
            href: `/progress/${you.courseId}`,
          }
        : you?.status === "took"
          ? { average: you.mark, tier: tier(you.mark), line: join(you.term, you.passed === true ? "passed" : you.passed === false ? "not passed" : null, you.teacher), next: null, href: `/progress/${you.courseId}` }
          : null,
    summary: summaryProps(v.ratings, "Recommend by semester"),
    mention: mention ? { date: mention.date ?? "", text: mention.text, tag: "Course", href: mention.url } : null,
    rateHref: v.rate?.canRate ? v.rate.href : null,
    rate: v.rate?.canRate ? { label: v.rate.rated ? "Edit your rating" : "Rate this course", opensIn: null } : v.rate?.opensIn ? { label: "Rate this course", opensIn: v.rate.opensIn } : null,
    // D4: the student's current courses next to the course.
    myCourses: v.myCourses?.length ? v.myCourses.map(listItem) : null,
    terms: null,
    locked: !v.signedIn,
  };
}

const sizeLabel = (n: number | null) => (n ? (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`) : null);

export function file(v: V.FileView): M.FileData {
  if (v.locked) return { file: null, course: null, courseLink: v.course ? { name: v.course.name, href: `/c/${v.course.code}` } : null };
  const href = v.url ?? `/files/${v.id}`;
  const pages = v.pages ? `${v.pages} page${v.pages === 1 ? "" : "s"}` : null;
  const me: V.FileItem = { id: v.id, source: v.source, title: v.title, type: v.type, typeLabel: v.typeLabel, format: v.format, formatCode: v.formatCode, week: v.week, date: v.date, dateLabel: v.dateLabel, from: v.from, lessonId: null, size: v.size, pages: v.pages, href: `/f/${v.id}` };
  const weekFiles = [me, ...(v.sameWeek ?? [])].map((f) => fileRow(f));
  const code = v.course.code;
  return {
    // D12: "Week 8 · 2 Nov · LMS · 24 pages · 3.1 MB".
    file: { id: v.id, title: v.title, meta: join(v.week != null && `Week ${v.week}`, v.dateLabel, v.from, pages ?? v.formatCode, sizeLabel(v.size)), type: v.type, previewUrl: v.url && v.format === "pdf" ? v.url : null, downloadHref: href, openHref: href },
    // D12: your courses on the left, the course as on its page in the middle (from file()).
    course: v.courseDetail
      ? { ...course(v.courseDetail), myCourses: v.myCourses?.length ? v.myCourses.map(listItem) : null }
      : code
      ? {
          code,
          name: v.course.name,
          kind: null,
          term: { label: "", options: [] },
          strip: strip(null),
          tabs: { overview: "Overview", files: 0, anonymous: 0, filesHref: `/c/${code}/files`, anonymousHref: `/c/${code}/anonymous` },
          weeks: v.week != null ? [{ n: v.week, title: `${weekFiles.length} file${weekFiles.length === 1 ? "" : "s"}`, current: false, files: weekFiles }] : [],
          weeksTotal: 16,
          filesTotal: 0,
          teachers: v.teacher ? [{ id: v.teacher.id, name: v.teacher.name, face: v.teacher.face, href: `/p/${v.teacher.id}`, line: "Lectures", pressFPct: null }] : [],
          grading: [],
          syllabus: [],
          me: null,
          summary: null,
          mention: null,
          rateHref: null,
          rate: null,
          myCourses: null,
          terms: null,
          locked: false,
          context: true,
        }
      : null,
    courseLink: { name: v.course.name, href: `/c/${code}` },
  };
}

/* ---------- Professors ---------- */

export function professor(v: V.ProfessorView): M.ProfessorData {
  const s = v.summary;
  const summary: RatingSummaryProps | null = s.enough
    ? {
        byline: `By ${s.count} students`,
        stats: [{ value: `${s.pressFPct}%`, label: "pressed F", tone: "accent" }],
        trend: s.trend.length > 1 ? { title: "Pressed F by semester", delta: s.delta != null ? `${s.delta >= 0 ? "↑" : "↓"} ${Math.abs(s.delta)} since ${shortTerm(s.trend[0].term)}` : undefined, points: s.trend.map((p) => ({ label: shortTerm(p.term), value: p.value })) } : undefined,
        byCourse: s.byCourse.map((b) => ({ label: join(v.courses.find((c) => c.code === b.courseId)?.name ?? b.courseId, b.role), pct: b.pct })),
      }
    : null;
  const mention = v.anonymous.latest[0];
  return {
    crumbs: [{ label: "Professors", href: "/professors" }, { label: join(v.school, v.department) || v.name }],
    name: v.name,
    face: v.face ?? null,
    title: join(v.position, v.department, v.school),
    stats: [
      ...(s.enough ? [{ value: `${s.pressFPct}%`, label: "pressed F", accent: true }] : []),
      { value: String(s.count), label: "students rated" },
      { value: String(v.courses.length), label: "courses now" },
      ...(v.years ? [{ value: `${v.years} yr${v.years === 1 ? "" : "s"}`, label: "at NewUU" }] : []),
    ],
    schedule: { term: termName(new Date()) ?? "this semester", rows: v.when.map((w) => ({ day: w.day, time: w.time, course: w.course, href: `/c/${w.code}`, role: ROLE_ONE[v.courses.find((c) => c.code === w.code)?.role ?? "other"], room: w.room ?? "" })) },
    summary,
    courses: v.courses.map((c) => ({ code: c.code, name: c.name, role: c.roleLabel, pct: c.pressFPct, href: c.href })),
    tags: s.enough ? s.tags.map((t) => ({ tag: t.tag, pct: t.pct })) : [],
    mention: mention ? { date: mention.date ?? "", text: mention.text, tag: "Teacher", href: mention.url } : null,
    background: background(v),
    // D9 "Press F if they taught you": straight to the rating of the viewer's course with them.
    rateHref: v.signedIn && (v.teachesYou || (v.rateHref && v.rateHref !== "/rate")) ? (v.rateHref ?? "/rate") : null,
  };
}

/** D9 Background: degrees, research area and publications from the LMS staff profile. */
function background(v: V.ProfessorView): M.ProfessorData["background"] {
  const out: M.ProfessorData["background"] = (v.education ?? []).map((e) => ({ title: [e.degree, e.field].filter(Boolean).join(" in ") || "Degree", meta: join(e.institution, e.year) }));
  if (v.research) out.push({ title: v.research, meta: "Research area" });
  const pubs = v.publications ?? [];
  const latest = [...pubs].sort((a, b) => Number(b.year ?? 0) - Number(a.year ?? 0))[0];
  if (latest) out.push({ title: `${pubs.length} publication${pubs.length === 1 ? "" : "s"}`, meta: `Latest: ${join(latest.title, latest.year)}` });
  return out;
}

export function professors(v: V.ProfessorsView): M.ProfessorsData {
  const yours = new Set(v.yours.map((p) => p.id));
  const rows = [...v.yours, ...v.all.filter((p) => !yours.has(p.id))];
  return { schools: v.schools, items: rows.map((p) => ({ id: p.id, name: p.name, face: p.face ?? null, dept: p.department ?? "", school: p.school, courses: p.course ?? "", pct: p.pressFPct, href: p.href, yours: yours.has(p.id) })) };
}

/* ---------- Progress ---------- */

const row = (c: V.ProgressCourse): M.ProgressRow => ({
  id: c.courseId,
  name: c.name,
  meta: c.code,
  average: c.average ?? c.mark,
  rating: c.rating,
  final: c.final,
  absences: c.absences ? { used: c.absences.missed, max: c.absences.limit, left: c.absences.left } : null,
  next: c.next ? `${c.next.title} · ${c.next.dueLabel}` : null,
  href: c.href,
  detail: null,
});

export function progress(v: V.ProgressView): M.ProgressData {
  const missed = v.courses.reduce((n, c) => n + (c.absences?.missed ?? 0), 0);
  const closest = [...v.courses].filter((c) => c.absences).sort((a, b) => a.absences!.left - b.absences!.left)[0];
  const earlier = v.earlier.filter((e) => e.gpa != null);
  return {
    gpa: v.gpa != null ? { value: v.gpa.toFixed(2), delta: "", note: join(v.currentTerm, v.semesterNumber && `semester ${v.semesterNumber}`), trend: earlier.map((e) => e.gpa!).reverse() } : null,
    credits: v.ectsEarned != null && v.ectsTotal ? { done: v.ectsEarned, total: v.ectsTotal, note: `${Math.max(0, v.ectsTotal - v.ectsEarned)} to go` } : null,
    attendance: closest ? { value: String(missed), note: `absences across ${v.courses.length} courses · closest: ${closest.name}, ${closest.absences!.left} left` } : null,
    week: null,
    rows: v.courses.map(row),
    open: null,
    semesters: [
      ...[...v.earlier].reverse().map((e) => ({ term: e.term, short: shortTerm(e.term), value: e.gpa, current: false, line: join(e.gpa != null && `GPA ${e.gpa.toFixed(2)}`, e.ects != null && `${e.ects} ECTS`) })),
      ...(v.currentTerm ? [{ term: v.currentTerm, short: shortTerm(v.currentTerm), value: v.gpa, current: true, line: "so far" }] : []),
    ],
    rate: v.rate.waiting > 0 ? { title: `${v.rate.waiting} course${v.rate.waiting === 1 ? "" : "s"} to rate`, line: join(v.rate.term, `${v.rate.rated} of ${v.rate.rated + v.rate.waiting} rated`, "press R to start"), href: "/rate" } : null,
    empty: v.empty,
  };
}

export function courseProgress(v: V.CourseProgressView): M.CourseProgressData {
  const c = v.course;
  const marks: NonNullable<M.ProgressRow["detail"]>["marks"] = [
    { label: "Average", value: c.average, max: 100, tier: tier(c.average) },
    { label: "Rating", value: c.rating, max: 100, tier: tier(c.rating) },
    { label: "Final", value: c.final, max: 100, tier: tier(c.final) },
  ];
  const classes = v.events.filter((e) => e.mark !== "unmarked").map((e) => (e.mark === "absent" ? "absent" : e.viaQr ? "qr" : "present") as "present" | "qr" | "absent");
  return {
    course: { name: c.name, code: c.code, href: `/c/${c.code}`, term: v.term, teacher: v.teacher },
    row: { ...row(c), meta: join(c.code, v.teacher), detail: { marks, classes, classesLabel: `Every class · ${classes.length} so far`, grading: [] } },
  };
}

/* ---------- Notifications ---------- */

export function notifications(v: V.NotificationsView): M.NotificationsData {
  const items = v.sections.flatMap((s) => s.items.map((i) => feedItem(i, s.title)));
  if (v.open && !items.some((i) => i.id === v.open!.id)) items.unshift(feedItem(v.open, "Today"));
  return { unread: v.unread, items, open: v.open?.id ?? items[0]?.id ?? null };
}

/* ---------- Calendar ---------- */

const CAL_KIND: Record<V.CalendarLayer, M.CalendarKind> = { classes: "class", exams: "exam", deadlines: "deadline", holidays: "holiday", registration: "registration" };

export function calendar(v: V.CalendarView, now = new Date()): M.CalendarData {
  const todayKey = v.days.find((d) => d.today)?.day ?? localDay(now);
  const events = v.days.flatMap((d) => d.events);
  const byDay = new Map<string, V.CalendarEvent[]>();
  for (const e of events) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  const months: M.CalendarMonth[] = [];
  const [y0, m0] = todayKey.split("-").map(Number);
  for (let i = 0; i < 5; i++) {
    const y = y0 + Math.floor((m0 - 1 + i) / 12);
    const m = ((m0 - 1 + i) % 12) + 1;
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
    let day = addDays(first, -lead);
    const weeks: M.CalendarMonth["weeks"] = [];
    do {
      const week: M.CalendarMonth["weeks"][number] = [];
      for (let d = 0; d < 7; d++) {
        week.push({ key: day, date: Number(day.slice(8)), inMonth: Number(day.slice(5, 7)) === m, today: day === todayKey, items: (byDay.get(day) ?? []).map((e) => ({ title: e.title, kind: CAL_KIND[e.layer], href: e.href })) });
        day = addDays(day, 1);
      }
      weeks.push(week);
    } while (Number(day.slice(5, 7)) === m);
    months.push({ label: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T12:00:00Z`)), weeks });
  }
  const onIds = v.layers.filter((l) => l.on).map((l) => l.id);
  return {
    months,
    filters: v.layers.map((l) => {
      const next = l.on ? onIds.filter((x) => x !== l.id) : [...onIds, l.id];
      return { id: l.id, label: l.label, on: l.on, href: `/calendar?layers=${next.join(",")}` };
    }),
    coming: events.filter((e) => e.layer !== "classes").slice(0, 6).map((e) => ({ title: e.title, meta: e.sub, kind: CAL_KIND[e.layer] })),
    empty: v.empty?.text ?? null,
    icsHref: v.icsHref,
  };
}

/* ---------- Search ---------- */

export function search(v: V.SearchView): M.SearchData {
  const groups: M.SearchData["groups"] = [
    { id: "courses" as const, label: "Courses", items: v.courses.map((c) => ({ id: c.code, title: c.name, meta: c.code, right: c.recommendPct != null ? `${c.recommendPct}% recommend` : null, href: c.href })) },
    { id: "professors" as const, label: "Professors", items: v.people.map((p) => ({ id: p.id, title: p.name, meta: p.position ?? "", right: null, href: p.href })) },
    { id: "files" as const, label: "Files", items: v.files.map((f) => ({ id: f.id, title: f.title, meta: f.course, right: null, href: f.href })) },
  ].filter((g) => g.items.length);
  const previews: M.SearchData["previews"] = {};
  for (const c of v.courses) previews[c.code] = { eyebrow: c.code, title: c.name, strip: { recommendPct: c.recommendPct, hours: null, difficulty: null, difficultyWord: null }, text: "", href: c.href };
  return { q: v.q, total: groups.reduce((n, g) => n + g.items.length, 0), groups, previews, suggestion: v.nothing ? "Search professors, files and programs by name or by code, like MATH 211." : null };
}

/* ---------- Next semester ---------- */

export function nextSemester(v: V.NextSemesterView): M.NextData {
  return {
    eyebrow: "Next semester · from your study plan",
    title: v.term ?? "Next semester",
    dates: v.phases.map((p) => ({ title: p.label, note: p.title })),
    rows: v.courses.map((c) => {
      const p = c.prerequisites[0];
      return {
        code: c.code ?? "",
        name: c.name,
        meta: join(c.code, c.cohorts.length && `${c.cohorts.length} cohort${c.cohorts.length === 1 ? "" : "s"}`),
        ects: c.ects,
        recommendPct: c.recommendPct,
        hours: c.ratings?.hoursLabel ?? "—",
        difficulty: c.ratings?.difficultyLabel ?? "—",
        prereq: p ? { name: p.text, status: p.status === "passed" ? "passed ✓" : p.status === "in-progress" ? "in progress" : p.status === "missing" ? "missing" : "", ok: p.status === "passed" } : null,
        href: c.href,
        detail: {
          eyebrow: join(c.code, c.ects != null && `${c.ects} ECTS`),
          strip: strip(c.ratings),
          cohorts: c.cohorts.map((h, i) => ({ title: `Cohort ${i + 1} · ${h.name}`, line: join(h.when, h.room), note: "", ok: true, pct: h.pressFPct, face: null })),
        },
      };
    }),
    lmsHref: "https://newuzbekistan.hero.study",
    note: "Press F doesn't register you — LMS does. We only help you choose.",
    missing: v.missing,
  };
}

/* ---------- Settings ---------- */

const ALERTS: Array<{ id: keyof V.ProfileView["alerts"]; title: string; note: string }> = [
  { id: "digest", title: "Morning digest", note: "07:30 on school days" },
  { id: "classReminder", title: "Class reminders", note: "15 minutes before" },
  { id: "absence", title: "Absences", note: "When LMS marks one" },
  { id: "grade", title: "New grades", note: "As soon as they're in" },
  { id: "file", title: "New files", note: "Bundled, at most once an hour" },
  { id: "announcement", title: "LMS announcements", note: "Teachers and university" },
  { id: "deadline", title: "Deadlines", note: "48 h and 3 h before" },
  { id: "rating", title: "Rating reminders", note: "When a semester's grades are in" },
  { id: "registration", title: "Registration and add/drop", note: "Cohort selection, add/drop windows" },
  { id: "exams", title: "Exams", note: "Week before and evening before" },
  { id: "anonymous", title: "Replies on Anonymous", note: "Your posts only" },
];

export function profile(v: V.ProfileView): M.SettingsData {
  return {
    account: { name: v.shortName, line: join(v.email, v.year != null && `Year ${v.year}`) },
    lms: { line: join(v.sync.label ? `Last sync ${v.sync.label}` : null, "password stored encrypted") },
    telegram: { linked: v.telegramLinked, line: v.telegramLinked ? "Linked — alerts and QR check-in live there" : "Not linked — alerts and QR check-in live there", href: "/link" },
    alerts: ALERTS.map((a) => ({ ...a, on: !!v.alerts[a.id] })),
    credit: "Made with love by chebarash · issues or ideas? Reach out on Telegram.",
  };
}

/* ---------- Rate ---------- */

export function rate(v: V.RateQueueView, courseId?: string | null): M.RateData {
  const find = <T extends V.RateItem>(list: T[] | undefined) => list?.find((w) => w.courseId === courseId || w.code === courseId);
  // A course waiting, this semester's course once its window is open, or a rating being edited (prefilled, D5).
  const rated = courseId ? v.rated.find((r) => (r.courseId === courseId || r.code === courseId) && r.canEdit) : undefined;
  const item = find(v.waiting) ?? find(v.current) ?? rated ?? v.waiting[0] ?? null;
  const answers = item && item === rated ? rated.answers : undefined;
  return {
    course: item ? { id: item.courseId, name: item.name, term: item.term, href: `/c/${item.code}` } : null,
    waiting: v.waiting.length,
    teachers: item ? item.teachers.map((t) => ({ id: t.id, name: t.name, role: t.roleLabel, kind: t.role, face: null })) : [],
    tags: [...COURSE_TAGS],
    initial: answers ? initialFrom(answers) : null,
  };
}

/** Saved answers → the D5 dialog's starting state. */
export function initialFrom(a: NonNullable<V.RatedItem["answers"]>): NonNullable<M.RateData["initial"]> {
  return {
    recommend: a.recommend,
    hours: a.hours,
    difficulty: a.difficulty,
    tags: [...a.tags],
    pressed: a.teachers.filter((t) => t.pressF).map((t) => t.teacherId),
    teacherTags: Object.fromEntries(a.teachers.map((t) => [`${t.teacherId}|${t.role}`, [...t.tags]])),
  };
}

/* ---------- Curriculum ---------- */

export function curriculum(v: V.CurriculumView): M.CurriculumData {
  return {
    program: v.program?.name ?? "Curriculum",
    line: join(v.years.length && `${v.years.length} years`, v.years.reduce((n, y) => n + y.terms.reduce((a, t) => a + t.courses.reduce((e, c) => e + (c.ects ?? 0), 0), 0), 0) + " ECTS"),
    programs: v.programs.map((p) => ({ id: p.id, name: p.name, href: `/programs/${p.id}`, on: p.id === v.program?.id })),
    years: v.years.map((y) => ({
      label: `Year ${y.year}`,
      semesters: y.terms.map((t) => ({ label: t.label, ects: t.courses.reduce((e, c) => e + (c.ects ?? 0), 0), courses: t.courses.map((c) => ({ code: c.code ?? "", name: c.name, ects: c.ects, pct: c.recommendPct, status: c.status, href: c.href })) })),
    })),
  };
}
