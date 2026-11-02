import { agenda, checkInOpen, mergeBlocks, type ClassEvent } from "@/core/agenda";
import { dayInfo } from "@/core/semester";
import { addDays, ago, clock, dayStart, localDay, weekdayName } from "@/core/time";
import type { ClassView, CourseCard, DeadlineView, ExamView, FeedView, NotificationsView, TodayView } from "@/server/views";
import type { GuestHomeData } from "./today/types";

/**
 * Every Figma state of Today, Notifications and QR as view-model data, for the
 * dev preview route and the screen tests. Times are Tashkent wall-clock.
 */

export const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(dayStart(day).getTime() + (h * 60 + m) * 60_000);
};

const TEACHERS: Record<string, { id: string; name: string }> = {
  MATH111: { id: "t1", name: "Gonçalo Pinto" },
  PHYS101: { id: "t2", name: "Emily Carter" },
  CS101: { id: "t3", name: "William Rodriguez" },
};

/** Calculus 1, Physics 1, Computer Science 1 every weekday. */
function events(fromDay: string, days = 14): ClassEvent[] {
  const out: ClassEvent[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(fromDay, i);
    const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    out.push(
      { courseId: "MATH111", courseName: "Calculus 1", code: "MATH111", kind: "lecture", start: at(day, "10:00"), end: at(day, "11:20"), teacher: "t1", room: "B-204" },
      { courseId: "PHYS101", courseName: "Physics 1", code: "PHYS101", kind: "lecture", start: at(day, "13:00"), end: at(day, "14:20"), teacher: "t2", room: "A-108" },
      { courseId: "CS101", courseName: "Computer Science 1", code: "CS101", kind: "lecture", start: at(day, "15:00"), end: at(day, "16:20"), teacher: "t3", room: "C-112" },
    );
  }
  return out;
}

function classView(e: ClassEvent, now: Date, next: Date | null): ClassView {
  const status = e.end <= now ? "done" : e.start <= now ? "now" : next && e.start.getTime() === next.getTime() ? "next" : "later";
  return {
    key: `${e.courseId}@${e.start.toISOString()}`, courseId: e.courseId, code: e.code ?? "", name: e.courseName, kind: e.kind,
    start: e.start.toISOString(), end: e.end.toISOString(), time: clock(e.start), endTime: clock(e.end), room: e.room ?? null,
    teacher: TEACHERS[e.courseId] ?? null, changedFrom: null, lessonIds: [], status,
  };
}

const COURSES: CourseCard[] = [
  { courseId: "MATH111", code: "MATH111", name: "Calculus 1", recommendPct: 84, teacher: TEACHERS.MATH111, when: "Mon, Wed 10:00 · B-204", mark: null, href: "/c/MATH111" },
  { courseId: "PHYS101", code: "PHYS101", name: "Physics 1", recommendPct: 62, teacher: TEACHERS.PHYS101, when: "Tue, Thu 13:00 · A-108", mark: null, href: "/c/PHYS101" },
];

const RATING: TodayView["rating"] = {
  level: "card",
  term: "Spring 2026",
  waiting: [
    { courseId: "DM", code: "MATH120", name: "Discrete Mathematics", term: "Spring 2026", teachers: [{ id: "t4", name: "Sardor Karimov", role: "lecture", roleLabel: "Lecture" }], href: "/rate/DM" },
    { courseId: "P2", code: "CS102", name: "Programming 2", term: "Spring 2026", teachers: [{ id: "t2", name: "Emily Carter", role: "lecture", roleLabel: "Lecture" }], href: "/rate/P2" },
  ],
};

export function feedItems(now: Date): FeedView[] {
  const item = (id: string, kind: FeedView["kind"], title: string, courseName: string | null, minAgo: number, extra: Partial<FeedView> = {}): FeedView => {
    const t = new Date(now.getTime() - minAgo * 60_000);
    return { id, kind, title, body: null, courseId: null, courseName, at: t.toISOString(), ago: ago(t, now), read: false, needsAck: false, href: null, ...extra };
  };
  return [
    item("lms:1", "announcement", "Quiz 6 opens tomorrow at 09:00", "Calculus 1 · Gonçalo Pinto", 60, {
      needsAck: true,
      body: "Quiz 6 covers integration by parts and improper integrals. It opens in LMS at 09:00 and closes at 23:59. One attempt, 20 minutes.",
    }),
    item("anon:1", "anonymous", "Is the Calculus 1 midterm the same for every section?", "Calculus 1 · 3 replies", 40, { href: "/c/MATH111/anonymous" }),
    item("grade:1", "grade", "New grade: 86 for the midterm", "Physics 1", 120),
    item("lms:2", "announcement", "Theory of Computation review sessions", "Alisher Ikramov", 180),
    item("abs:1", "absence", "Marked absent · 2 left", "Physics 1 · Practice 14", 60 * 24 * 4, { read: true }),
    item("file:1", "file", "2 new files: Midterm review slides, Mock midterm", "Calculus 1 · Week 8", 60 * 24 * 2, { read: true }),
    item("due:1", "deadline", "Assignment 3 is due in 2 days", "Software Project Management · Thursday 23:59", 60 * 24 * 1.2, { read: true }),
    item("sys:1", "system", "Room changed to A-108", "Physics 1 · Thursday 13:00", 60 * 24 * 1.5, { read: true }),
  ];
}

function due(now: Date): DeadlineView[] {
  const d = (id: string, course: string, title: string, inDays: number, status: DeadlineView["status"], statusLabel: string): DeadlineView => {
    const t = at(addDays(localDay(now), inDays), "23:59");
    return { id, course, title, due: t.toISOString(), dueLabel: `${weekdayName(t)} 23:59`, until: `in ${inDays} days`, status, statusLabel, grade: null };
  };
  return [d("hw1", "Software Project Management", "Assignment 3: risk plan", 3, "todo", "Not submitted"), d("hw2", "Physics 1", "Lab 6 report", 6, "in-progress", "In progress")];
}

const EXAMS = (now: Date): ExamView[] =>
  [
    { courseId: "MATH111", name: "Calculus 1", start: at("2026-11-05", "10:00"), room: "B-204" },
    { courseId: "PHYS101", name: "Physics 1", start: at("2026-11-06", "13:00"), room: "A-108" },
  ]
    .filter((e) => e.start > now)
    .map((e) => ({
      key: e.courseId, courseId: e.courseId, name: e.name, kind: "midterm" as const, start: e.start.toISOString(), time: clock(e.start), room: e.room,
      dayLabel: localDay(e.start) === addDays(localDay(now), 1) ? "Tomorrow" : weekdayName(e.start), label: `${e.name} midterm`,
    }));

function student(now: Date, extra: Partial<TodayView> = {}, opts: { from?: string; classes?: boolean } = {}): TodayView {
  const info = dayInfo(now);
  const all = opts.classes === false ? [] : events(opts.from ?? addDays(localDay(now), -1));
  const blocks = mergeBlocks(all);
  const a = agenda(now, blocks, info);
  const todays = all.filter((e) => localDay(e.start) === info.day);
  const classes = todays.map((e) => classView(e, now, a.next?.start ?? null));
  const later = all.find((e) => localDay(e.start) > info.day) ?? null;
  const exams = EXAMS(now);
  const feed = feedItems(now);
  return {
    now: now.toISOString(),
    title: info.weekend ? weekdayName(now) : "Today",
    weekLabel: info.label,
    state: a.state,
    sync: { syncedAt: at(info.day, "08:40").toISOString(), stale: false, lmsDown: false, signInAgain: false },
    banner: null,
    tiles: {
      nextClass: classes.find((c) => c.status === "next" || c.status === "now")?.time ?? (later ? clock(later.start) : null),
      absences: { left: 2, courseId: "PHYS101", name: "Physics 1" },
      exam: exams[0] ? { label: `Exam ${weekdayName(new Date(exams[0].start)).slice(0, 3)}`, start: exams[0].start } : null,
      courses: 4,
      qrOpen: checkInOpen(a.current ?? a.next, now),
    },
    classes,
    current: classes.find((c) => c.status === "now") ?? null,
    next: classes.find((c) => c.status === "next") ?? null,
    upcoming: later && !["running", "before", "between"].includes(a.state) ? { label: `${localDay(later.start) === addDays(info.day, 1) ? "Tomorrow" : weekdayName(later.start)} ${clock(later.start)}`, class: classView(later, now, null) } : null,
    materials: [],
    phase: null,
    examsThisWeek: exams.filter((e) => e.start.slice(0, 10) <= addDays(info.day, 7)),
    nextExams: exams,
    rating: RATING,
    notifications: { unread: feed.filter((i) => !i.read).length, items: feed.slice(0, 4) },
    dueSoon: due(now),
    courses: COURSES,
    ...extra,
  };
}

const MON = "2026-10-26";
const NO_RATING: TodayView["rating"] = { level: "none", term: null, waiting: [] };

export const TODAY_STATES = {
  "2.1-morning": () => student(at(MON, "08:30")),
  "2.2-afternoon": () => student(at(MON, "14:30")),
  "2.3-over": () => student(at(MON, "17:30")),
  "2.4-weekend": () => student(at("2026-10-31", "11:00")),
  "2.5-break": () => {
    const v = student(at("2026-12-23", "11:00"), { dueSoon: [], courses: COURSES.slice(0, 1), nextExams: [], examsThisWeek: [] }, { classes: false });
    return { ...v, notifications: { unread: 1, items: v.notifications.items.filter((i) => i.kind === "anonymous") } };
  },
  "2.6-exams": () => student(at("2026-11-03", "08:00"), { rating: NO_RATING }),
  "2.7-lms-down": () =>
    student(at(MON, "08:50"), {
      rating: NO_RATING,
      sync: { syncedAt: at(MON, "08:40").toISOString(), stale: true, lmsDown: true, signInAgain: false },
      banner: { id: "lms-down", kind: "lms-down", text: "LMS isn't answering. Showing what we had at 08:40.", action: { label: "Retry", href: null } },
    }),
  "2.8-sign-in": () =>
    student(at(MON, "08:50"), {
      rating: NO_RATING,
      sync: { syncedAt: at(MON, "08:40").toISOString(), stale: true, lmsDown: false, signInAgain: true },
      banner: { id: "sign-in", kind: "sign-in", text: "Your LMS password changed, so syncing stopped. Sign in again to get new grades and files.", action: { label: "Sign in", href: "/sign-in" } },
    }),
  "2.11-rating": () => student(at(MON, "17:30"), { rating: { ...RATING, level: "shine" } }),
  "2.12-caught-up": () => {
    const v = student(at(MON, "08:30"), { rating: NO_RATING, dueSoon: [] });
    return { ...v, notifications: { unread: 0, items: v.notifications.items.map((i) => ({ ...i, read: true, needsAck: false })) } };
  },
  "2.13-first-day": () =>
    student(at("2026-09-14", "08:30"), {
      rating: NO_RATING,
      notifications: { unread: 0, items: [] },
      dueSoon: [],
      nextExams: [],
      examsThisWeek: [],
      banner: { id: "semester-start", kind: "semester-start", text: "Fall 2026 starts today. 4 courses, 18 ECTS — your timetable and files are ready.", action: { label: "My courses", href: "/courses" } },
    }),
  "10.1-class-running": () => student(at(MON, "12:56")),
} satisfies Record<string, () => TodayView>;

export const GUEST: GuestHomeData = {
  guest: true,
  popular: [
    { code: "MATH111", name: "Calculus 1", href: "/c/MATH111", teacher: TEACHERS.MATH111, line: "≈ 6 h/wk · Hard-ish", recommendPct: 84 },
    { code: "PHYS101", name: "Physics 1", href: "/c/PHYS101", teacher: TEACHERS.PHYS101, line: "≈ 8 h/wk · Hard", recommendPct: 62 },
  ],
  freshFiles: [
    { id: "f1", title: "Midterm exam", type: "exam", course: "Physics 1", date: "Fall 2024", source: { label: "Channel", kind: "channel" }, href: "/f/f1" },
    { id: "f2", title: "Mock final with answers", type: "mock", course: "Discrete Mathematics", date: "Spring 2025", source: { label: "Students", kind: "channel" }, href: "/f/f2" },
  ],
  schools: [
    { id: "computing", name: "School of Computing", programs: [{ id: "se", name: "Software Engineering" }, { id: "cs", name: "Cyber Security" }, { id: "ai", name: "AI & Robotics" }] },
    { id: "engineering", name: "School of Engineering", programs: [{ id: "me", name: "Mechanical" }, { id: "ch", name: "Chemical & Materials" }, { id: "ae", name: "Aerospace" }] },
    { id: "management", name: "School of Management", programs: [{ id: "im", name: "Industrial Management" }] },
    { id: "humanities", name: "School of Humanities & Sciences", programs: [{ id: "am", name: "Applied Mathematics" }, { id: "ed", name: "Economics & Data Science" }, { id: "st", name: "STEM Education" }] },
    { id: "medicine", name: "School of Medicine", programs: [{ id: "md", name: "Doctor of Medicine" }] },
  ],
};

export function notificationsFixture(open?: string): NotificationsView {
  const now = at("2026-11-02", "12:00");
  const items = feedItems(now);
  const today = items.filter((i) => localDay(new Date(i.at)) === localDay(now));
  const week = items.filter((i) => localDay(new Date(i.at)) !== localDay(now));
  return {
    sync: { syncedAt: now.toISOString(), stale: false, lmsDown: false, signInAgain: false },
    unread: items.filter((i) => !i.read).length,
    filter: "all",
    filters: [
      { id: "all", label: "All", count: 8 },
      { id: "announcement", label: "LMS", count: 2 },
      { id: "grade", label: "Grades", count: 1 },
      { id: "absence", label: "Absences", count: 1 },
      { id: "file", label: "Files", count: 1 },
      { id: "anonymous", label: "Anonymous", count: 1 },
      { id: "deadline", label: "Deadlines", count: 1 },
    ],
    sections: [
      { title: "Today", items: today },
      { title: "This week", items: week },
    ],
    open: open ? (items.find((i) => i.id === open) ?? null) : null,
  };
}

export const qrFixture = (): TodayView => TODAY_STATES["10.1-class-running"]();
