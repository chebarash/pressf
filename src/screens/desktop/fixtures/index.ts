/** Sample data copied from the Figma desktop frames, for the screens until their view models land. */
import type * as T from "./types";

const goncalo: T.Teacher = { id: "t-pinto", name: "Gonçalo Pinto", face: null, href: "/p/t-pinto" };
const emily: T.Teacher = { id: "t-carter", name: "Emily Carter", face: null, href: "/p/t-carter" };
const sardor: T.Teacher = { id: "t-karimov", name: "Sardor Karimov", face: null, href: "/p/t-karimov" };

const slides: T.FileRowData = { id: "f1", title: "Lecture 15 slides", type: "lecture", date: "2 Nov", source: "lms", href: "/f/f1" };
const practice: T.FileRowData = { id: "f2", title: "Practice problems", type: "practice", date: "2 Nov", source: "lms", href: "/f/f2" };
const review: T.FileRowData = { id: "f3", title: "Midterm review slides", type: "lecture", date: "2 Nov", source: "lms", href: "/f/f3" };
const pastExam: T.FileRowData = { id: "f4", title: "Midterm exam, Fall 2025", type: "exam", date: "3 Nov", source: "students", href: "/f/f4" };

const feed: T.FeedItemVM[] = [
  { id: "n1", kind: "announcement", title: "Quiz 6 opens tomorrow at 09:00", meta: "LMS · Calculus 1 · 1 h ago · needs your OK", unread: true, href: "/notifications?open=n1", section: "Today", eyebrow: "LMS announcement · Calculus 1 · Gonçalo Pinto · 1 h ago", body: ["Quiz 6 covers integration by parts and improper integrals. It opens in LMS at 09:00 and closes at 23:59. You get one attempt, 20 minutes.", "Practice problems from Lecture 15 are close to what will be asked."], needsAck: true, course: { name: "Calculus 1", href: "/c/MATH111" } },
  { id: "n2", kind: "grade", title: "New grade: 86 for the midterm", meta: "Physics 1 · 2 h ago", unread: true, href: "/notifications?open=n2", section: "Today", eyebrow: "New grade · Physics 1 · 2 h ago", body: ["Your midterm is marked: 86 of 100. The class average is 71."], course: { name: "Physics 1", href: "/c/PHYS101" } },
  { id: "n3", kind: "anonymous", title: "Is the Calculus 1 midterm the same for every section?", meta: "Anonymous · 3 replies · 40 min ago", unread: true, href: "/notifications?open=n3", section: "Today", eyebrow: "Anonymous · Calculus 1 · 40 min ago", body: ["3 new replies on your post."], course: { name: "Calculus 1", href: "/c/MATH111" } },
  { id: "n4", kind: "announcement", title: "Theory of Computation review sessions", meta: "LMS · Alisher Ikramov · 3 h ago", unread: true, href: "/notifications?open=n4", section: "Today", eyebrow: "LMS announcement · Alisher Ikramov · 3 h ago", body: ["Review sessions run every Friday at 16:00 in C-112 until the final."] },
  { id: "n5", kind: "absence", title: "Marked absent · 2 left", meta: "Physics 1 · Practice 14 · Thu", unread: false, href: "/notifications?open=n5", section: "This week", eyebrow: "Absence · Physics 1 · Thu", body: ["You were marked absent at Practice 14. 13 of 15 used, 2 left."], course: { name: "Physics 1", href: "/c/PHYS101" } },
  { id: "n6", kind: "file", title: "2 new files: Midterm review slides, Mock midterm", meta: "Calculus 1 · Week 8", unread: false, href: "/notifications?open=n6", section: "This week", eyebrow: "New files · Calculus 1 · Week 8", body: ["Midterm review slides and Mock midterm with answers were added."], course: { name: "Calculus 1", href: "/c/MATH111" } },
  { id: "n7", kind: "deadline", title: "Assignment 3 is due in 2 days", meta: "Software Project Management", unread: false, href: "/notifications?open=n7", section: "This week", eyebrow: "Deadline · Software Project Management", body: ["Assignment 3: risk plan is due Thursday at 23:59."] },
];

const courseCards: T.CourseCardVM[] = [
  { code: "MATH111", name: "Calculus 1", href: "/c/MATH111", recommendPct: 84, teacher: goncalo, line: "Mon, Wed 10:00 · B-204" },
  { code: "PHYS101", name: "Physics 1", href: "/c/PHYS101", recommendPct: 62, teacher: emily, line: "Tue, Thu 13:00 · A-108" },
];

export const today: T.TodayData = {
  greeting: "Good morning, Shamsiddin",
  dateLine: "Monday 2 November · Week 8 of 16 · midterm week",
  next: { label: "Next · starts in 25 min", title: "Calculus 1", line: "10:00–11:20 · B-204 · Gonçalo Pinto · Lecture 15", href: "/c/MATH111", files: [slides, practice], note: "Absences 9 of 15 · 6 left · QR check-in is on your phone" },
  day: [
    { time: "09:00", title: "Quiz 6 opens", meta: "LMS · Calculus 1", tone: "deadline" },
    { time: "10:00", title: "Calculus 1", meta: "B-204 · Lecture 15", tone: "next", href: "/c/MATH111" },
    { time: "13:00", title: "Physics 1", meta: "A-108 · moved from B-110", tone: "class", href: "/c/PHYS101" },
    { time: "15:00", title: "Computer Science 1", meta: "C-112 · Lab", tone: "class", href: "/c/CS100" },
    { time: "23:59", title: "Lab report due", meta: "Physics 1 · in progress", tone: "deadline" },
  ],
  now: { time: "09:35", before: 1 },
  feed: { unread: 4, items: [feed[0], feed[1], feed[2], { ...feed[4], meta: "Physics 1 · Practice 14 · Thu" }] },
  due: [
    { title: "Assignment 3: risk plan", meta: "Software Project Management · Thu 23:59", status: "Not submitted", late: true },
    { title: "Lab 6 report", meta: "Physics 1 · Sun 23:59", status: "In progress", late: false },
  ],
  exam: { when: "Thursday", title: "Calculus 1 midterm", meta: "5 Nov · 10:00 · B-204 · 3 past papers" },
  courses: courseCards,
  rate: { eyebrow: "2 courses · 30 seconds", title: "Rate Spring 2026", text: "Next year's students choose by this. Anonymous.", href: "/rate" },
};

const filesFor = (title: string, extra = ""): T.FileRowData[] => [
  { id: `${title}-1`, title: `${title} slides`, type: "lecture", date: "2 Nov", source: "lms", href: "/f/x1" },
  { id: `${title}-2`, title: extra || "Practice problems", type: "practice", date: "2 Nov", source: "lms", href: "/f/x2" },
];
const h = (hh: number, mm = 0) => hh * 60 + mm;
export const timetable: T.TimetableData = {
  weekLabel: "Week 8 · 2–6 Nov · midterms",
  prevHref: "/timetable?week=7",
  nextHref: "/timetable?week=9",
  todayHref: "/timetable",
  days: [
    { label: "Mon 2", today: true },
    { label: "Tue 3", today: false },
    { label: "Wed 4", today: false },
    { label: "Thu 5", today: false },
    { label: "Fri 6", today: false },
  ],
  startHour: 9,
  endHour: 20,
  now: { day: 0, minutes: h(9, 35) },
  selected: "c1",
  classes: [
    { id: "c1", day: 0, start: h(10), end: h(11, 20), title: "Calculus 1", meta: "10:00 · B-204 · Lecture", tone: "teal", tags: ["MATH111", "Lecture 15"], when: "Mon 2 Nov · 10:00–11:20", room: "B-204", teacher: "Gonçalo Pinto · lectures", files: [slides, practice], absences: { line: "Absences in this course: 9 of 15", left: "6 left" }, href: "/c/MATH111" },
    { id: "c2", day: 0, start: h(15), end: h(16, 20), title: "Computer Science 1", meta: "15:00 · C-112 · Lab", tone: "plum", tags: ["CS100", "Lab"], when: "Mon 2 Nov · 15:00–16:20", room: "C-112", teacher: "William Rodriguez · labs", files: filesFor("Lab 7"), absences: { line: "Absences in this course: 3 of 15", left: "12 left" }, href: "/c/CS100" },
    { id: "c3", day: 1, start: h(13), end: h(14, 20), title: "Physics 1", meta: "13:00 · A-108 · moved", tone: "mustard", tags: ["PHYS101", "Practice"], when: "Tue 3 Nov · 13:00–14:20", room: "A-108 · moved from B-110", teacher: "Emily Carter · practice", files: filesFor("Practice 15"), absences: { line: "Absences in this course: 13 of 15", left: "2 left" }, href: "/c/PHYS101" },
    { id: "c4", day: 2, start: h(10), end: h(11, 20), title: "Calculus 1", meta: "10:00 · B-204 · Tutorial", tone: "teal", tags: ["MATH111", "Tutorial"], when: "Wed 4 Nov · 10:00–11:20", room: "B-204", teacher: "Emily Carter · tutorials", files: [review], absences: { line: "Absences in this course: 9 of 15", left: "6 left" }, href: "/c/MATH111" },
    { id: "c5", day: 2, start: h(12), end: h(13, 20), title: "Academic English", meta: "12:00 · D-015", tone: "moss", tags: ["ENG101"], when: "Wed 4 Nov · 12:00–13:20", room: "D-015", teacher: "Daniel Smith", files: [], absences: { line: "Absences in this course: 2 of 8", left: "6 left" }, href: "/c/ENG101" },
    { id: "c6", day: 3, start: h(10), end: h(12), title: "Calculus 1 · MIDTERM", meta: "10:00–12:00 · B-204", tone: "rust", tags: ["MATH111", "Midterm"], when: "Thu 5 Nov · 10:00–12:00", room: "B-204", teacher: "Gonçalo Pinto", files: [review, pastExam], absences: null, href: "/c/MATH111" },
    { id: "c7", day: 4, start: h(9), end: h(10, 20), title: "Academic English", meta: "09:00 · D-015", tone: "moss", tags: ["ENG101"], when: "Fri 6 Nov · 09:00–10:20", room: "D-015", teacher: "Daniel Smith", files: [], absences: { line: "Absences in this course: 2 of 8", left: "6 left" }, href: "/c/ENG101" },
    { id: "c8", day: 4, start: h(13), end: h(15), title: "Physics 1 · MIDTERM", meta: "13:00–15:00 · A-108", tone: "rust", tags: ["PHYS101", "Midterm"], when: "Fri 6 Nov · 13:00–15:00", room: "A-108", teacher: "Emily Carter", files: [], absences: null, href: "/c/PHYS101" },
  ],
};

const list: T.CourseListItem[] = [
  { code: "MATH111", name: "Calculus 1", href: "/c/MATH111", recommendPct: 84, next: "Next: Mon 10:00 · B-204", absences: "9/15" },
  { code: "PHYS101", name: "Physics 1", href: "/c/PHYS101", recommendPct: 62, next: "Next: Tue 13:00 · A-108", absences: "13/15" },
  { code: "CS100", name: "Computer Science 1", href: "/c/CS100", recommendPct: 86, next: "Next: Mon 15:00 · C-112", absences: "3/15" },
  { code: "ENG101", name: "Academic English", href: "/c/ENG101", recommendPct: 80, next: "Next: Wed 12:00 · D-015", absences: "2/8" },
];
const terms: T.CoursesData["terms"] = [
  { id: "now", label: "Now", href: "/courses", active: true },
  { id: "s26", label: "Spring 26", href: "/courses?term=Spring+2026", active: false },
  { id: "f25", label: "Fall 25", href: "/courses?term=Fall+2025", active: false },
  { id: "all", label: "All", href: "/courses?term=all", active: false },
];
export const courses: T.CoursesData = {
  terms,
  courses: list,
  cards: [
    ...courseCards,
    { code: "CS100", name: "Computer Science 1", href: "/c/CS100", recommendPct: 86, teacher: { id: "t-rod", name: "William Rodriguez", face: null, href: "/p/t-rod" }, line: "Mon 15:00 · C-112" },
    { code: "ENG101", name: "Academic English", href: "/c/ENG101", recommendPct: 80, teacher: { id: "t-smith", name: "Daniel Smith", face: null, href: "/p/t-smith" }, line: "Wed 12:00 · D-015" },
  ],
};

export const course: T.CourseData = {
  code: "MATH111",
  name: "Calculus 1",
  kind: "Core",
  term: { label: "Fall 2026 · Now", options: [{ label: "Fall 2026 · Now", href: "/c/MATH111" }, { label: "Spring 2026", href: "/c/MATH111?term=Spring+2026" }, { label: "Fall 2025", href: "/c/MATH111?term=Fall+2025" }] },
  strip: { recommendPct: 84, hours: 6, difficulty: 3.4, difficultyWord: "Hard-ish" },
  tabs: { overview: "Overview", files: 9, anonymous: 23, filesHref: "/c/MATH111/files", anonymousHref: "/c/MATH111/anonymous" },
  weeks: [
    { n: 7, title: "Indeterminate forms and L'Hôpital's rule", current: false, files: [] },
    { n: 8, title: "Midterm exams", current: true, files: [review, pastExam] },
    { n: 9, title: "Antiderivatives; Areas and distances.", current: false, files: [] },
  ],
  weeksTotal: 16,
  filesTotal: 9,
  teachers: [
    { ...goncalo, line: "Lectures · Mon, Wed 10:00 · B-204", pressFPct: 84 },
    { ...emily, line: "Tutorials · Tue 13:00 · A-108", pressFPct: 80 },
    { ...sardor, line: "Labs · Fri 14:00 · C-012", pressFPct: 72 },
  ],
  grading: [
    { pct: 40, title: "Final Exam", note: "Date to be announced" },
    { pct: 30, title: "Midterm Exam", note: "Date to be announced" },
    { pct: 30, title: "Assignments", note: "One quiz every week except week 7" },
  ],
  syllabus: [
    { title: "Credits and workload", meta: "6 ECTS · 180 hours · about 12 a week" },
    { title: "What you'll learn", meta: "10 outcomes" },
    { title: "Books", meta: "2 books · 1 in Press F" },
    { title: "Prerequisites", meta: "Needs Precalculus · unlocks Calculus 2" },
  ],
  me: { average: 74, tier: "Mid", line: "Average 74 · rating 51 · absences 9 of 15", next: "Next: Quiz 6 · tomorrow 09:00 · midterm Thursday 10:00", href: "/progress/MATH111" },
  summary: {
    by: "By 63 students · Fall 2024 – Fall 2026",
    recommendPct: 84,
    hours: 6,
    difficulty: 4,
    trend: [{ term: "F24", value: 71 }, { term: "S25", value: 76 }, { term: "F25", value: 81 }, { term: "S26", value: 79 }, { term: "F26", value: 84 }],
    delta: "↑ 13 since F24",
    tags: [{ tag: "Exam follows lectures", pct: 71 }, { tag: "Useful later", pct: 58 }, { tag: "Strict attendance", pct: 44 }],
  },
  mention: { date: "Mar 12, 2026", text: "Is Calculus 1 harder with the morning section or is it the same exam for everyone?", tag: "Course", href: "/c/MATH111/anonymous" },
  rateHref: "/rate/MATH111",
  myCourses: list,
  terms,
};

export const file: T.FileData = {
  file: { id: "f3", title: "Midterm review slides", meta: "Week 8 · 2 Nov · LMS · 24 pages · 3.1 MB", type: "lecture", previewUrl: null, downloadHref: "/files/f3", openHref: "/files/f3" },
  course: { ...course, weeks: course.weeks.map((w) => (w.n === 8 ? { ...w, files: [review, { id: "f5", title: "Mock midterm with answers", type: "exam", date: "3 Nov", source: "channel", href: "/f/f5" }] } : w)) },
};

export const professor: T.ProfessorData = {
  crumbs: [{ label: "Professors", href: "/professors" }, { label: "School of Computing · Mathematics" }],
  name: "Gonçalo Pinto",
  face: null,
  title: "Senior lecturer · Department of Mathematics · School of Computing",
  stats: [{ value: "91%", label: "pressed F", accent: true }, { value: "128", label: "students rated" }, { value: "3", label: "courses now" }, { value: "5 yrs", label: "at NewUU" }],
  schedule: {
    term: "Fall 2026",
    rows: [
      { day: "Mon", time: "10:00", course: "Calculus 1", href: "/c/MATH111", role: "Lecture", room: "B-204" },
      { day: "Tue", time: "13:00", course: "Precalculus", href: "/c/MATH101", role: "Lecture", room: "A-108" },
      { day: "Wed", time: "10:00", course: "Calculus 1", href: "/c/MATH111", role: "Lecture", room: "B-204" },
      { day: "Thu", time: "15:00", course: "Calculus 2", href: "/c/MATH211", role: "Tutorial", room: "B-204" },
    ],
  },
  trend: [{ term: "F24", value: 86 }, { term: "S25", value: 88 }, { term: "F25", value: 87 }, { term: "S26", value: 89 }, { term: "F26", value: 91 }],
  delta: "↑ 5 since F24",
  byCourse: [{ label: "Precalculus · lectures", pct: 93 }, { label: "Calculus 1 · lectures", pct: 84 }, { label: "Calculus 2 · tutorials", pct: 88 }],
  courses: [
    { code: "MATH101", name: "Precalculus", role: "Lectures", pct: 93, href: "/c/MATH101" },
    { code: "MATH111", name: "Calculus 1", role: "Lectures", pct: 84, href: "/c/MATH111" },
    { code: "MATH211", name: "Calculus 2", role: "Tutorials", pct: 88, href: "/c/MATH211" },
    { code: "MATH305", name: "Numerical Methods", role: "Fall 2025 · lectures", pct: 79, href: "/c/MATH305" },
  ],
  tags: [{ tag: "Explains clearly", pct: 78 }, { tag: "Answers questions", pct: 66 }, { tag: "Grades fairly", pct: 52 }, { tag: "Quick feedback", pct: 41 }],
  mention: { date: "Mar 3, 2026", text: "Which Calculus section should I pick if I want more practice problems?", tag: "Teacher", href: "/p/t-pinto#anonymous" },
  background: [
    { title: "PhD in Applied Mathematics", meta: "University of Porto · 2014" },
    { title: "MSc in Mathematics", meta: "University of Porto · 2009" },
    { title: "12 publications", meta: "Latest: Stability of discrete dynamical systems with delays · 2022" },
  ],
  rateHref: "/rate/MATH111",
};

const calcRow: T.ProgressRow = {
  id: "MATH111",
  name: "Calculus 1",
  meta: "MATH111 · Gonçalo Pinto",
  average: 74,
  rating: 51,
  final: null,
  absences: { used: 9, max: 15, left: 6 },
  next: "Quiz 6 · tomorrow 09:00",
  href: "/progress/MATH111",
  detail: {
    marks: [
      { label: "Q1", value: 8, max: 10, tier: "High" },
      { label: "Q2", value: 6, max: 10, tier: "Mid" },
      { label: "Q3", value: 9, max: 10, tier: "High" },
      { label: "Q4", value: 7, max: 10, tier: "Mid" },
      { label: "Q5", value: 7, max: 10, tier: "Mid" },
      { label: "Mid", value: null, max: 30, tier: "None" },
      { label: "Final", value: null, max: 40, tier: "None" },
    ],
    classes: ["present", "present", "present", "absent", "present", "present", "present", "present", "qr", "present", "present", "absent", "present", "present", "present", "present", "present", "absent", "present", "qr", "present", "present", "present", "absent", "present", "present", "present", "absent", "present", "present", "present", "present", "absent"],
    classesLabel: "Every class · 30 so far",
    grading: [{ label: "Quizzes · 20%", value: "7.4 avg" }, { label: "Midterm · 30%", value: "Thu" }, { label: "Final · 40%", value: "Jan" }, { label: "Attendance · 10%", value: "87%" }],
  },
};
export const progress: T.ProgressData = {
  gpa: { value: "3.62", delta: "↑ 0.07 this year", note: "this semester so far 3.66", trend: [3.31, 3.42, 3.48, 3.48, 3.55, 3.7, 3.66] },
  credits: { done: 168, total: 240, note: "72 to go · 2 semesters · graduation June 2028" },
  attendance: { pct: "87%", note: "27 absences across 4 courses · closest: Physics 1, 2 left" },
  week: { title: "2 exams · 3 due", note: "Thu Calculus 1 midterm · Fri Physics 1 midterm · Quiz 6 tomorrow" },
  open: "MATH111",
  rows: [
    calcRow,
    { id: "PHYS101", name: "Physics 1", meta: "PHYS101 · Emily Carter", average: 86, rating: 80, final: null, absences: { used: 13, max: 15, left: 2 }, next: "Lab report · Sunday 23:59", href: "/progress/PHYS101", detail: null },
    { id: "CS100", name: "Computer Science 1", meta: "CS100 · William Rodriguez", average: 91, rating: 88, final: null, absences: { used: 3, max: 15, left: 12 }, next: null, href: "/progress/CS100", detail: null },
    { id: "ENG101", name: "Academic English", meta: "ENG101 · Daniel Smith", average: null, rating: null, final: null, absences: { used: 2, max: 8, left: 6 }, next: "Essay draft · Friday 18:00", href: "/progress/ENG101", detail: null },
  ],
  semesters: [
    { term: "Fall 2023", short: "F23", value: 3.31, current: false, line: "GPA 3.31 · 30 ECTS" },
    { term: "Spring 2024", short: "S24", value: 3.42, current: false, line: "GPA 3.42 · 30 ECTS" },
    { term: "Fall 2024", short: "F24", value: 3.48, current: false, line: "GPA 3.48 · 30 ECTS" },
    { term: "Spring 2025", short: "S25", value: 3.48, current: false, line: "GPA 3.48 · 30 ECTS" },
    { term: "Fall 2025", short: "F25", value: 3.55, current: false, line: "GPA 3.55 · 30 ECTS" },
    { term: "Spring 2026", short: "S26", value: 3.7, current: false, line: "GPA 3.70 · 30 ECTS" },
    { term: "Fall 2026", short: "F26", value: 3.66, current: true, line: "so far" },
  ],
  rate: { title: "2 courses to rate", line: "Spring 2026 · 6 of 8 rated · press R to start", href: "/rate" },
};
export const courseProgress: T.CourseProgressData = { course: { name: "Calculus 1", code: "MATH111", href: "/c/MATH111" }, row: calcRow };

export const notifications: T.NotificationsData = { unread: 4, items: feed, open: "n1" };
export const notificationsRead: T.NotificationsData = { unread: 0, items: [], open: null };

const cell = (date: number, inMonth = true, items: T.CalendarData["weeks"][number][number]["items"] = [], today = false) => ({ date, inMonth, today, items });
export const calendar: T.CalendarData = {
  month: "November 2026",
  prevHref: "/calendar?m=2026-10",
  nextHref: "/calendar?m=2026-12",
  filters: [
    { id: "classes", label: "Classes", on: false },
    { id: "exams", label: "Exams", on: true },
    { id: "deadlines", label: "Deadlines", on: true },
    { id: "holidays", label: "Holidays", on: true },
    { id: "registration", label: "Registration", on: true },
  ],
  weeks: [
    [cell(26, false), cell(27, false), cell(28, false), cell(29, false), cell(30, false), cell(31, false), cell(1)],
    [cell(2, true, [{ title: "Week 8 · midterms", kind: "week" }], true), cell(3, true, [{ title: "Lab report 23:59", kind: "deadline" }]), cell(4), cell(5, true, [{ title: "Calculus 1 midterm", kind: "exam" }, { title: "Assignment 3", kind: "deadline" }]), cell(6, true, [{ title: "Physics 1 midterm", kind: "exam" }]), cell(7), cell(8)],
    [cell(9, true, [{ title: "Add/drop opens", kind: "registration" }]), cell(10), cell(11), cell(12), cell(13, true, [{ title: "Essay draft", kind: "deadline" }]), cell(14), cell(15)],
    [cell(16), cell(17), cell(18), cell(19), cell(20, true, [{ title: "Add/drop closes", kind: "registration" }]), cell(21), cell(22)],
    [cell(23), cell(24), cell(25), cell(26), cell(27, true, [{ title: "Quiz 7", kind: "deadline" }]), cell(28), cell(29)],
  ],
  coming: [
    { title: "Calculus 1 midterm", meta: "Thu 5 Nov · 10:00 · B-204", kind: "exam" },
    { title: "Physics 1 midterm", meta: "Fri 6 Nov · 13:00 · A-108", kind: "exam" },
    { title: "Add/drop opens", meta: "Mon 9 Nov · Until 20 Nov", kind: "registration" },
    { title: "Constitution Day", meta: "Tue 8 Dec · No classes", kind: "holiday" },
    { title: "Final exams", meta: "11–15 Jan · Times when LMS publishes", kind: "exam" },
  ],
  icsHref: "/calendar.ics",
};

export const search: T.SearchData = {
  q: "calc",
  total: 12,
  filters: [
    { id: "all", label: "All 12", href: "/search?q=calc", on: true },
    { id: "courses", label: "Courses 4", href: "/search?q=calc&in=courses", on: false },
    { id: "professors", label: "Professors 2", href: "/search?q=calc&in=professors", on: false },
    { id: "files", label: "Files 6", href: "/search?q=calc&in=files", on: false },
  ],
  groups: [
    { id: "courses", label: "Courses", items: [
      { id: "MATH111", title: "Calculus 1", meta: "MATH111 · Gonçalo Pinto · Fall, Spring", right: "84% recommend", href: "/c/MATH111" },
      { id: "MATH211", title: "Calculus 2", meta: "MATH211 · Gonçalo Pinto, Emily Carter", right: "78% recommend", href: "/c/MATH211" },
      { id: "MATH101", title: "Precalculus", meta: "MATH101", right: "93% recommend", href: "/c/MATH101" },
    ] },
    { id: "professors", label: "Professors", items: [{ id: "t-pinto", title: "Gonçalo Pinto", meta: "Senior lecturer · Mathematics", right: "91% pressed F", href: "/p/t-pinto" }] },
    { id: "files", label: "Files", items: [
      { id: "f4", title: "Midterm exam · Calculus 1", meta: "Fall 2023 · Channel", right: null, href: "/f/f4" },
      { id: "f3", title: "Midterm review slides · Calculus 1", meta: "Week 8 · LMS", right: null, href: "/f/f3" },
    ] },
  ],
  preview: { eyebrow: "MATH111 · 6 ECTS · Core", title: "Calculus 1", strip: course.strip, text: "Limits, derivatives and integrals. Taught by Gonçalo Pinto (lectures), Emily Carter (tutorials), Sardor Karimov (labs).", href: "/c/MATH111" },
  suggestion: null,
};
export const searchEmpty: T.SearchData = { ...search, q: "calculas 3", groups: [], preview: null, suggestion: "Did you mean Calculus 3? Or search professors, files and programs by code: MATH 211." };

const cohort = (n: number, teacher: string, line: string, note: string, ok: boolean, pct: number) => ({ title: `Cohort ${n} · ${teacher}`, line, note, ok, pct, face: null });
export const next: T.NextData = {
  eyebrow: "Next semester · from your study plan",
  title: "Spring 2027",
  dates: [{ title: "9–13 Feb", note: "Cohort selection" }, { title: "16 Feb", note: "Classes start" }, { title: "16–27 Feb", note: "Add / drop" }],
  rows: [
    { code: "MATH211", name: "Calculus 2", meta: "MATH211 · 2 cohorts · Core", ects: 6, recommendPct: 78, hours: "≈ 7 h/wk", difficulty: "Hard", prereq: { name: "Calculus 1", status: "passed ✓", ok: true }, detail: { eyebrow: "MATH211 · 6 ECTS · Core", strip: { recommendPct: 78, hours: 7, difficulty: 4, difficultyWord: "Hard" }, cohorts: [cohort(1, "Gonçalo Pinto", "Mon, Wed 10:00 · B-204", "Fits your plan", true, 88), cohort(2, "Emily Carter", "Tue, Thu 15:00 · A-108", "Clashes with Physics 2 (Thu)", false, 80)] } },
    { code: "CS200", name: "Data Structures", meta: "CS200 · 3 cohorts · Core", ects: 6, recommendPct: 88, hours: "≈ 8 h/wk", difficulty: "Hard", prereq: { name: "CS 1", status: "passed ✓", ok: true }, detail: { eyebrow: "CS200 · 6 ECTS · Core", strip: { recommendPct: 88, hours: 8, difficulty: 4, difficultyWord: "Hard" }, cohorts: [cohort(1, "William Rodriguez", "Mon, Wed 13:00 · C-112", "Fits your plan", true, 90)] } },
    { code: "PHYS102", name: "Physics 2", meta: "PHYS102 · 1 cohort · Core", ects: 6, recommendPct: 64, hours: "≈ 6 h/wk", difficulty: "Medium", prereq: { name: "Physics 1", status: "in progress", ok: false }, detail: { eyebrow: "PHYS102 · 6 ECTS · Core", strip: { recommendPct: 64, hours: 6, difficulty: 3, difficultyWord: "Medium" }, cohorts: [cohort(1, "Emily Carter", "Tue, Thu 13:00 · A-108", "Fits your plan", true, 80)] } },
    { code: "MATH220", name: "Discrete Mathematics", meta: "MATH220 · 2 cohorts · Core", ects: 6, recommendPct: 71, hours: "≈ 6 h/wk", difficulty: "Medium", prereq: null, detail: { eyebrow: "MATH220 · 6 ECTS · Core", strip: { recommendPct: 71, hours: 6, difficulty: 3, difficultyWord: "Medium" }, cohorts: [] } },
    { code: "ECON101", name: "Microeconomics", meta: "ECON101 · elective", ects: 6, recommendPct: 81, hours: "≈ 4 h/wk", difficulty: "Easy", prereq: null, detail: { eyebrow: "ECON101 · 6 ECTS · Elective", strip: { recommendPct: 81, hours: 4, difficulty: 2, difficultyWord: "Easy" }, cohorts: [] } },
  ],
  lmsHref: "https://newuzbekistan.hero.study",
  note: "Press F doesn't register you — LMS does. We only help you choose.",
};

export const settings: T.SettingsData = {
  account: { name: "Shamsiddin A.", line: "s.student@newuu.uz · Software Engineering · Year 4" },
  lms: { line: "Last sync 2 min ago · password stored encrypted" },
  telegram: { linked: false, line: "Not linked — alerts and QR check-in live there", href: "/link" },
  alerts: [
    { id: "digest", title: "Morning digest", note: "07:30 on school days", on: true },
    { id: "classReminder", title: "Class reminders", note: "15 minutes before", on: true },
    { id: "absence", title: "Absences", note: "When LMS marks one", on: true },
    { id: "grade", title: "New grades", note: "As soon as they're in", on: true },
    { id: "file", title: "New files", note: "Bundled, at most once an hour", on: true },
    { id: "announcement", title: "LMS announcements", note: "Teachers and university", on: true },
    { id: "deadline", title: "Deadlines", note: "48 h and 3 h before", on: true },
    { id: "registration", title: "Exams and registration", note: "Week before and evening before", on: true },
    { id: "anonymous", title: "Replies on Anonymous", note: "Your posts only", on: false },
  ],
  credit: "Made with love by chebarash · issues or ideas? Reach out on Telegram.",
};

export const rate: T.RateData = {
  course: { id: "MATH111", name: "Calculus 1", term: "Fall 2026", href: "/c/MATH111" },
  teachers: [
    { id: "t-pinto", name: "Gonçalo Pinto", role: "Lectures", face: null },
    { id: "t-carter", name: "Emily Carter", role: "Tutorials", face: null },
    { id: "t-karimov", name: "Sardor Karimov", role: "Labs", face: null },
  ],
  tags: ["Exam follows lectures", "Useful later", "Heavy reading", "Lots of group work", "Strict about attendance", "Fair exams"],
  initial: { recommend: "yes", hours: "6-10", difficulty: 4, tags: ["Exam follows lectures", "Useful later"], pressed: ["t-pinto", "t-karimov"] },
};

export const professors: T.ProfessorsData = {
  filters: [
    { id: "all", label: "All", href: "/professors", on: true },
    { id: "computing", label: "Computing", href: "/professors?school=computing", on: false },
    { id: "engineering", label: "Engineering", href: "/professors?school=engineering", on: false },
    { id: "management", label: "Management", href: "/professors?school=management", on: false },
    { id: "humanities", label: "Humanities", href: "/professors?school=humanities", on: false },
  ],
  items: [
    { id: "t-pinto", name: "Gonçalo Pinto", face: null, dept: "Mathematics", courses: "Precalculus, Calculus 1, Calculus 2", pct: 91, count: 128, href: "/p/t-pinto" },
    { id: "t-carter", name: "Emily Carter", face: null, dept: "Physics", courses: "Physics 1, Calculus 1", pct: 80, count: 96, href: "/p/t-carter" },
    { id: "t-karimov", name: "Sardor Karimov", face: null, dept: "Mathematics", courses: "Calculus 1 labs", pct: 72, count: 41, href: "/p/t-karimov" },
    { id: "t-rod", name: "William Rodriguez", face: null, dept: "Computer Science", courses: "Computer Science 1, Data Structures", pct: 88, count: 77, href: "/p/t-rod" },
    { id: "t-smith", name: "Daniel Smith", face: null, dept: "Languages", courses: "Academic English", pct: null, count: 3, href: "/p/t-smith" },
  ],
};

const c = (code: string, name: string, status: "passed" | "now" | "next" | "later", ects = 6) => ({ code, name, ects, status, href: `/c/${code}` });
export const curriculum: T.CurriculumData = {
  program: "Software Engineering",
  line: "BSc · 240 ECTS · 8 semesters · School of Computing",
  years: [
    { label: "Year 1", semesters: [
      { label: "Fall", ects: 30, courses: [c("MATH101", "Precalculus", "passed"), c("CS100", "Computer Science 1", "passed"), c("ENG100", "English Foundations", "passed"), c("HIST101", "History of Uzbekistan", "passed"), c("PHYS100", "Physics Foundations", "passed")] },
      { label: "Spring", ects: 30, courses: [c("MATH111", "Calculus 1", "now"), c("PHYS101", "Physics 1", "now"), c("CS100", "Computer Science 1", "now"), c("ENG101", "Academic English", "now"), c("PHIL101", "Critical Thinking", "passed")] },
    ] },
    { label: "Year 2", semesters: [
      { label: "Fall", ects: 30, courses: [c("MATH211", "Calculus 2", "next"), c("CS200", "Data Structures", "next"), c("PHYS102", "Physics 2", "next"), c("MATH220", "Discrete Mathematics", "next"), c("ECON101", "Microeconomics", "next")] },
      { label: "Spring", ects: 30, courses: [c("CS210", "Algorithms", "later"), c("CS220", "Databases", "later"), c("MATH230", "Linear Algebra", "later"), c("SE200", "Software Design", "later"), c("STAT200", "Statistics", "later")] },
    ] },
  ],
};
