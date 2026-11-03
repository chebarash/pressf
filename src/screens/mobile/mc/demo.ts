import type {
  AssignmentsView, CalendarEvent, CalendarLayer, CalendarView, CourseProgressView, CurriculumView, DeadlineView, ProfessorRow, ProfessorsView, ProfessorView, ProfileView, ProgressCourse, ProgressView, SchoolsView, SearchView,
} from "@/server/views";
import { DEFAULT_ALERTS } from "@/core/notifications";
import type { RateQueueView } from "@/screens/mobile/views";

/**
 * The Figma 10 Redesign states of Progress, Calendar, Search, People and
 * Profile as view-model data, for the dev preview route (/screens/mc) only.
 */

const sync = { syncedAt: "2026-11-02T03:40:00.000Z", stale: false, lmsDown: false, signInAgain: false };

const due = (id: string, course: string, title: string, dueLabel: string, status: DeadlineView["status"], statusLabel: string, grade: number | null = null, at = "2026-11-05T18:59:00.000Z"): DeadlineView => ({
  id, course, title, due: at, dueLabel, until: "", status, statusLabel, grade,
});

const course = (courseId: string, name: string, mark: number | null, tier: ProgressCourse["tier"], rating: number | null, missed: number, limit: number, status: "ok" | "low" | "last" | "over", next: DeadlineView | null): ProgressCourse => ({
  courseId, code: courseId, name, mark, tier, average: mark, rating, final: null, passed: null, fx: false,
  absences: { missed, left: limit - missed, limit, status, line: "" }, next, href: `/progress/${courseId}`,
});

const COURSES: ProgressCourse[] = [
  course("MATH111", "Calculus 1", 74, "Mid", 51, 9, 15, "ok", due("q6", "Calculus 1", "Quiz 6", "Tomorrow 09:00", "todo", "Not submitted")),
  course("PHYS101", "Physics 1", 86, "High", 80, 13, 15, "low", due("lr", "Physics 1", "Lab report", "Sunday 23:59", "todo", "Not submitted")),
  course("CS101", "Computer Science 1", 91, "High", 88, 3, 15, "ok", null),
  course("ENG101", "Academic English", null, "None", null, 2, 8, "ok", due("ed", "Academic English", "Essay draft", "Friday 18:00", "todo", "Not submitted")),
];

const progressBase: ProgressView = {
  state: sync,
  gpa: 3.62,
  ectsEarned: 168,
  ectsTotal: 240,
  semesterNumber: 7,
  currentTerm: "Fall 2026",
  courses: COURSES,
  earlier: [
    { term: "Spring 2026", courses: 5, ects: 30, gpa: 3.7 },
    { term: "Fall 2025", courses: 5, ects: 30, gpa: 3.55 },
  ],
  rate: { term: "Spring 2026", waiting: 2, rated: 6 },
  empty: false,
  results: null,
};

export const PROGRESS: Record<string, () => ProgressView> = {
  "5.1": () => progressBase,
  "5.3": () => ({ ...progressBase, gpa: null, ectsEarned: null, ectsTotal: null, courses: [], earlier: [], rate: { term: null, waiting: 0, rated: 0 }, empty: true }),
  "5.5": () => ({ ...progressBase, state: { ...sync, lmsDown: true } }),
  "5.6": () => ({
    ...progressBase,
    gpa: 3.63,
    ectsEarned: 198,
    rate: { term: "Fall 2026", waiting: 4, rated: 0 },
    results: {
      term: "Fall 2026",
      gpa: 3.66,
      courses: [
        { courseId: "CS101", name: "Computer Science 1", mark: 91, passed: true, fx: false },
        { courseId: "PHYS101", name: "Physics 1", mark: 86, passed: true, fx: false },
        { courseId: "MATH111", name: "Calculus 1", mark: 78, passed: true, fx: false },
        { courseId: "ENG101", name: "Academic English", mark: 48, passed: false, fx: true },
      ],
    },
  }),
};

export const courseProgressDemo = (): CourseProgressView => ({
  state: sync,
  course: { ...COURSES[0], absences: { missed: 9, left: 6, limit: 15, status: "ok", line: "" } },
  term: "Fall 2026",
  teacher: "Gonçalo Pinto",
  events: [
    { lesson: "Quiz 5", kind: "practice", at: "2026-10-31T05:00:00.000Z", dateLabel: "Sat 31 Oct", mark: "present", viaQr: false, score: 7 },
    { lesson: "Lecture 15", kind: "lecture", at: "2026-11-02T05:00:00.000Z", dateLabel: "Mon 2 Nov", mark: "present", viaQr: true, score: null },
    { lesson: "Practice 14", kind: "practice", at: "2026-10-29T05:00:00.000Z", dateLabel: "Thu 29 Oct", mark: "absent", viaQr: false, score: null },
    { lesson: "Lecture 14", kind: "lecture", at: "2026-10-26T05:00:00.000Z", dateLabel: "Mon 26 Oct", mark: "unmarked", viaQr: false, score: null },
  ],
});

export const assignmentsDemo = (): AssignmentsView => ({
  state: sync,
  dueThisWeek: [
    due("a3", "Software Project Management", "Assignment 3: risk plan", "Thursday 23:59", "todo", "Not submitted"),
    due("l6", "Physics 1", "Lab 6 report", "Sunday 23:59", "in-progress", "In progress"),
  ],
  later: [],
  waiting: [due("l5", "Physics 1", "Lab 5 report", "Wednesday 23:59", "submitted", "Under review", null, "2026-10-28T18:59:00.000Z")],
  graded: [due("a2", "Software Project Management", "Assignment 2: scope", "", "checked", "Checked", 9)],
  missed: [],
  courseHref: { "Software Project Management": "/progress/SPM301", "Physics 1": "/progress/PHYS101" },
});

const ev = (key: string, layer: CalendarLayer, title: string, sub: string, day: string): CalendarEvent => ({ key, layer, title, sub, day, endDay: day, time: null, href: null });
const LAYER_LIST: Array<{ id: CalendarLayer; label: string }> = [
  { id: "classes", label: "Classes" }, { id: "exams", label: "Exams" }, { id: "deadlines", label: "Deadlines" }, { id: "holidays", label: "Holidays" }, { id: "registration", label: "Registration" },
];

const calendarBase: CalendarView = {
  sync,
  layers: LAYER_LIST.map((l) => ({ ...l, on: l.id !== "classes" })),
  days: [
    { day: "2026-11-02", label: "Mon 2 Nov · today", today: true, events: [ev("lr", "deadlines", "Lab report", "Deadline · Physics 1 · 23:59", "2026-11-02")] },
    { day: "2026-11-05", label: "Thu 5 Nov", today: false, events: [ev("cm", "exams", "Calculus 1 midterm", "Exam · 10:00 · B-204", "2026-11-05"), ev("a3", "deadlines", "Assignment 3: risk plan", "Deadline · Software Project Management · 23:59", "2026-11-05")] },
    { day: "2026-11-06", label: "Fri 6 Nov", today: false, events: [ev("pm", "exams", "Physics 1 midterm", "Exam · 13:00 · A-108", "2026-11-06")] },
    { day: "2026-11-09", label: "Mon 9 Nov", today: false, events: [ev("ad", "registration", "Add/drop for Spring 2027 opens", "Registration · Until 20 Nov · from the LMS semester calendar", "2026-11-09")] },
    { day: "2026-12-08", label: "Tue 8 Dec", today: false, events: [ev("cd", "holidays", "Constitution Day", "Holiday · No classes", "2026-12-08")] },
    { day: "2027-01-11", label: "11–15 Jan", today: false, events: [ev("fe", "exams", "Final exams", "Exam · Your times appear when the LMS publishes them", "2027-01-11")] },
  ],
  empty: null,
  subscribe: { google: "https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fpressf.chebarash.uz%2Fcalendar.ics", personal: false },
};

export const SEARCH: Record<string, () => SearchView> = {
  "7.1": () => ({ q: "", courses: [], people: [], programs: [], files: [], nothing: false }),
  "7.2": () => ({
    q: "calc",
    courses: [
      { code: "MATH111", name: "Calculus 1", recommendPct: 84, href: "/c/MATH111" },
      { code: "MATH211", name: "Calculus 2", recommendPct: 78, href: "/c/MATH211" },
    ],
    people: [{ id: "t1", name: "Gonçalo Pinto", position: "Professor", face: null, href: "/p/t1" }],
    programs: [],
    files: [{ id: "f1", title: "Midterm exam", course: "Calculus 1", href: "/f/f1" }],
    nothing: false,
  }),
  "7.3": () => ({ q: "quantum", courses: [], people: [], programs: [], files: [], nothing: true }),
};

/** 7.1's "Recent", seeded into localStorage by the preview. */
export const RECENT = [
  { kind: "course", title: "Physics 1", subtitle: "PHYS101 · 62% recommend", href: "/c/PHYS101" },
  { kind: "person", title: "Emily Carter", subtitle: "Senior lecturer · Physics", href: "/p/t2" },
];

const professorBase: ProfessorView = {
  id: "t1",
  name: "Gonçalo Pinto",
  position: "Senior lecturer",
  face: null,
  department: "Department of Mathematics",
  school: "School of Computing",
  summary: {
    enough: true,
    count: 128,
    pressFPct: 91,
    tags: [{ tag: "Explains clearly", pct: 78 }, { tag: "Answers questions", pct: 66 }, { tag: "Grades fairly", pct: 52 }],
    byCourse: [],
    trend: [
      { term: "Fall 2024", value: 86, count: 20 }, { term: "Spring 2025", value: 89, count: 22 }, { term: "Fall 2025", value: 88, count: 25 },
      { term: "Spring 2026", value: 90, count: 30 }, { term: "Fall 2026", value: 91, count: 31 },
    ],
    delta: 5,
  },
  courses: [
    { code: "MATH100", name: "Precalculus", role: "lecture", roleLabel: "lectures", pressFPct: 93, href: "/c/MATH100" },
    { code: "MATH111", name: "Calculus 1", role: "lecture", roleLabel: "lectures", pressFPct: 84, href: "/c/MATH111" },
    { code: "MATH211", name: "Calculus 2", role: "tutorial", roleLabel: "tutorials", pressFPct: 88, href: "/c/MATH211" },
  ],
  when: [
    { day: "Mon", weekday: 1, time: "10:00", course: "Calculus 1", code: "MATH111", room: "B-204" },
    { day: "Tue", weekday: 2, time: "13:00", course: "Precalculus", code: "MATH100", room: "A-108" },
    { day: "Thu", weekday: 4, time: "15:00", course: "Calculus 2", code: "MATH211", room: "B-204" },
  ],
  education: [
    { degree: "PhD", field: "Applied Mathematics", institution: "University of Porto", year: "2014" },
    { degree: "MSc", field: "Mathematics", institution: "University of Porto", year: "2009" },
  ],
  publications: [
    { title: "Stability of discrete dynamical systems with delays", venue: "Journal of Difference Equations", year: "2022", url: null },
    { title: "A note on monotone iterative schemes", venue: "Applied Mathematics Letters", year: "2019", url: null },
    ...Array.from({ length: 10 }, (_, i) => ({ title: `Paper ${i + 3}`, venue: "Journal", year: "2018", url: null })),
  ],
  research: null,
  years: 5,
  since: "Fall 2021",
  anonymous: { count: 1, latest: [{ id: 1, url: "https://t.me/c/1/1", text: "Which Calculus section should I pick if I want more practice problems?", date: "2026-03-03T07:00:00.000Z" }] },
  signedIn: true,
  teachesYou: true,
  rateHref: "/rate/MATH111",
};

export const PROFESSOR: Record<string, () => ProfessorView> = {
  "7.4": () => professorBase,
  "7.5": () => ({ ...professorBase, signedIn: false, teachesYou: false }),
  "7.9": () => ({ ...professorBase, summary: { enough: false, count: 3 } }),
};

const prof = (id: string, name: string, department: string, course: string | null, pressFPct: number | null): ProfessorRow => ({
  id, name, department, school: "School of Computing", course, pressFPct, href: `/p/${id}`, face: null,
});

export const professorsDemo = (): ProfessorsView => ({
  count: 214,
  schools: ["School of Computing", "School of Engineering", "School of Management", "Humanities & Sciences"],
  yours: [prof("t1", "Gonçalo Pinto", "Mathematics", "Calculus 1", 91), prof("t2", "Emily Carter", "Physics", "Physics 1", 80)],
  all: [
    prof("t3", "Alisher Ikramov", "Computer Science", null, 86), prof("t4", "Daniel Smith", "English", null, 74),
    prof("t5", "Sardor Karimov", "Mathematics", null, 72), prof("t6", "Sejuti Rahman", "Computer Science", null, null),
  ],
});

export const schoolsDemo = (): SchoolsView => ({
  programCount: 28,
  schools: [
    { id: "s1", name: "School of Computing", programs: [{ id: "p1", name: "Software Engineering" }, { id: "p2", name: "Cyber Security" }, { id: "p3", name: "AI & Robotics" }] },
    { id: "s2", name: "School of Engineering", programs: [{ id: "p4", name: "Mechanical" }, { id: "p5", name: "Chemical & Materials" }, { id: "p6", name: "Aerospace" }] },
    { id: "s3", name: "School of Management", programs: [{ id: "p7", name: "Industrial Management" }] },
    { id: "s4", name: "Humanities & Sciences", programs: [{ id: "p8", name: "Applied Mathematics" }, { id: "p9", name: "Economics & Data Science" }] },
    { id: "s5", name: "School of Medicine", programs: [{ id: "p10", name: "Doctor of Medicine" }] },
  ],
});

const tile = (courseId: string, name: string, status: CurriculumView["years"][number]["terms"][number]["courses"][number]["status"]) => ({ courseId, code: courseId, name, ects: 6, recommendPct: null, status, href: `/c/${courseId}` });

export const curriculumDemo = (): CurriculumView => ({
  program: { id: "p2", name: "B.Sc. Cyber Security" },
  programs: [],
  years: [1, 2, 3, 4].map((year) => ({
    year,
    terms: [
      { label: "Fall", semesterId: `${year}f`, courses: [tile("MATH101", "Precalculus", "now"), tile("MATH111", "Calculus 1", "now"), tile("PHYS101", "Physics 1", "planned"), tile("CS100", "Computer Science 1", "planned")] },
      { label: "Spring", semesterId: `${year}s`, courses: [tile("MATH211", "Calculus 2", "now"), tile("MATH221", "Discrete Mathematics", "planned")] },
    ],
  })),
});

export const profileDemo = (): ProfileView => ({
  name: "Shamsiddin Abdurakhimov",
  shortName: "Shamsiddin A.",
  email: "s.student@newuu.uz",
  year: 4,
  role: "student",
  telegramLinked: true,
  alerts: { ...DEFAULT_ALERTS, anonymous: false },
  sync: { ...sync, label: "2 min ago" },
  ratings: { count: 6, waiting: 2 },
  uploads: { count: 0, live: 0 },
  feed: LAYER_LIST.map((l) => ({ ...l, on: true })),
});

const rateItem = (courseId: string, name: string, term: string) => ({ courseId, code: courseId, name, term, teachers: [], href: `/rate/${courseId}` });

export const myRatingsDemo = (): RateQueueView => ({
  currentTerm: "Fall 2026",
  total: 4,
  ask: { level: "card", term: "Spring 2026", waiting: [rateItem("MATH221", "Discrete Mathematics", "Spring 2026")] },
  waiting: [rateItem("MATH221", "Discrete Mathematics", "Spring 2026")],
  rated: [
    { ...rateItem("MATH111", "Calculus 1", "Fall 2025"), recommend: "yes", pressedF: ["Gonçalo Pinto"], updatedAt: "2026-01-20T00:00:00.000Z", updatedLabel: "20 Jan", canEdit: true },
    { ...rateItem("PHYS101", "Physics 1", "Fall 2025"), recommend: "unsure", pressedF: ["Emily Carter"], updatedAt: "2026-01-20T00:00:00.000Z", updatedLabel: "20 Jan", canEdit: true },
    { ...rateItem("ENG101", "Academic English", "Fall 2025"), recommend: "no", pressedF: [], updatedAt: "2026-01-20T00:00:00.000Z", updatedLabel: "20 Jan", canEdit: true },
  ],
});

export const CALENDAR: Record<string, () => CalendarView> = {
  "6.1": () => calendarBase,
  "6.2": () => ({ ...calendarBase, layers: LAYER_LIST.map((l) => ({ ...l, on: l.id === "holidays" })), days: [], empty: { text: "The next one is Constitution Day, 8 Dec." } }),
};
