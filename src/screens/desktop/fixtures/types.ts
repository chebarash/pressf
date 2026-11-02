/**
 * View-model shapes the desktop screens render. Until the matching function in
 * src/server/views lands, each screen is typed against these; once it lands the
 * screen's prop becomes `Awaited<ReturnType<typeof views.x>>` and these go away.
 */
import type { FeedKind, FileRowData, Strip } from "../parts";

export type { FeedKind, FileRowData, Strip };

export type Teacher = { id: string; name: string; face: string | null; href: string };

export type CourseCardVM = { code: string; name: string; href: string; recommendPct: number | null; teacher: Teacher | null; line: string };

export type FeedItemVM = {
  id: string;
  kind: FeedKind;
  title: string;
  meta: string;
  unread: boolean;
  href: string;
  section?: "Today" | "This week" | "Earlier";
  /** Detail pane. */
  eyebrow?: string;
  body?: string[];
  needsAck?: boolean;
  course?: { name: string; href: string } | null;
};

export type TodayData = {
  greeting: string;
  dateLine: string;
  next: null | {
    label: string;
    title: string;
    line: string;
    href: string;
    files: FileRowData[];
    note: string | null;
  };
  day: Array<{ time: string; title: string; meta: string; tone: "class" | "next" | "deadline"; href?: string }>;
  /** The red now-line goes before `day[before]`. */
  now: { time: string; before: number } | null;
  feed: { unread: number; items: FeedItemVM[] };
  due: Array<{ title: string; meta: string; status: string; late: boolean; href?: string }>;
  exam: null | { when: string; title: string; meta: string; href?: string };
  courses: CourseCardVM[];
  rate: null | { eyebrow: string; title: string; text: string; href: string };
};

export type ClassTone = "teal" | "mustard" | "plum" | "moss" | "rust";
export type TimetableClass = {
  id: string;
  day: number;
  /** Minutes from midnight, local time. */
  start: number;
  end: number;
  title: string;
  meta: string;
  tone: ClassTone;
  tags: string[];
  when: string;
  room: string | null;
  teacher: string | null;
  files: FileRowData[];
  absences: { line: string; left: string } | null;
  href: string;
};
export type TimetableData = {
  weekLabel: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  days: Array<{ label: string; today: boolean }>;
  startHour: number;
  endHour: number;
  now: { day: number; minutes: number } | null;
  classes: TimetableClass[];
  /** Class opened in the inspector first. */
  selected: string | null;
};

export type CourseListItem = { code: string; name: string; href: string; recommendPct: number | null; next: string; absences: string | null };
export type CoursesData = {
  terms: Array<{ id: string; label: string; href: string; active: boolean }>;
  courses: CourseListItem[];
  cards: CourseCardVM[];
};

export type Mention = { date: string; text: string; tag: string; href: string };
export type RatingSummaryVM = {
  by: string;
  recommendPct: number;
  hours: number | null;
  difficulty: number | null;
  trend: Array<{ term: string; value: number }>;
  delta: string | null;
  tags: Array<{ tag: string; pct: number }>;
};
export type CourseData = {
  code: string;
  name: string;
  kind: string | null;
  term: { label: string; options: Array<{ label: string; href: string }> };
  strip: Strip;
  tabs: { overview: string; files: number; anonymous: number; filesHref: string; anonymousHref: string };
  weeks: Array<{ n: number; title: string; current: boolean; files: FileRowData[] }>;
  weeksTotal: number;
  filesTotal: number;
  teachers: Array<Teacher & { line: string; pressFPct: number | null }>;
  grading: Array<{ pct: number; title: string; note: string }>;
  syllabus: Array<{ title: string; meta: string; href?: string }>;
  me: null | { average: number | null; tier: "High" | "Mid" | "Low" | "None"; line: string; next: string | null; href: string };
  summary: RatingSummaryVM | null;
  mention: Mention | null;
  rateHref: string | null;
  /** The student's courses for the list pane (desktop shows it beside the course). */
  myCourses: CourseListItem[] | null;
  terms: CoursesData["terms"] | null;
};

export type FileData = {
  file: {
    id: string;
    title: string;
    meta: string;
    type: string;
    /** Inline preview (PDF); null when only a download makes sense. */
    previewUrl: string | null;
    downloadHref: string;
    openHref: string;
  };
  course: CourseData | null;
};

export type ProfessorData = {
  crumbs: Array<{ label: string; href?: string }>;
  name: string;
  face: string | null;
  title: string;
  stats: Array<{ value: string; label: string; accent?: boolean }>;
  schedule: { term: string; rows: Array<{ day: string; time: string; course: string; href: string; role: string; room: string }> };
  trend: Array<{ term: string; value: number }>;
  delta: string | null;
  byCourse: Array<{ label: string; pct: number }>;
  courses: Array<{ code: string; name: string; role: string; pct: number | null; href: string }>;
  tags: Array<{ tag: string; pct: number }>;
  mention: Mention | null;
  background: Array<{ title: string; meta: string }>;
  rateHref: string | null;
};

export type ProgressRow = {
  id: string;
  name: string;
  meta: string;
  average: number | null;
  rating: number | null;
  final: number | null;
  absences: { used: number; max: number; left: number } | null;
  next: string | null;
  href: string;
  detail: null | {
    marks: Array<{ label: string; value: number | null; max: number; tier: "High" | "Mid" | "Low" | "None" }>;
    classes: Array<"present" | "qr" | "absent">;
    classesLabel: string;
    grading: Array<{ label: string; value: string }>;
  };
};
export type ProgressData = {
  gpa: { value: string; delta: string; note: string; trend: number[] } | null;
  credits: { done: number; total: number; note: string } | null;
  attendance: { pct: string; note: string } | null;
  week: { title: string; note: string } | null;
  rows: ProgressRow[];
  open: string | null;
  semesters: Array<{ term: string; short: string; value: number | null; current: boolean; line: string }>;
  rate: null | { title: string; line: string; href: string };
};
export type CourseProgressData = { course: { name: string; code: string; href: string }; row: ProgressRow };

export type NotificationsData = { unread: number; items: FeedItemVM[]; open: string | null };

export type CalendarKind = "week" | "deadline" | "exam" | "registration" | "holiday";
export type CalendarData = {
  month: string;
  prevHref: string;
  nextHref: string;
  filters: Array<{ id: "classes" | "exams" | "deadlines" | "holidays" | "registration"; label: string; on: boolean }>;
  weeks: Array<Array<{ date: number; inMonth: boolean; today: boolean; items: Array<{ title: string; kind: CalendarKind; href?: string }> }>>;
  coming: Array<{ title: string; meta: string; kind: CalendarKind }>;
  icsHref: string;
};

export type SearchItem = { id: string; title: string; meta: string; right: string | null; href: string };
export type SearchData = {
  q: string;
  total: number;
  filters: Array<{ id: string; label: string; href: string; on: boolean }>;
  groups: Array<{ id: "courses" | "professors" | "files"; label: string; items: SearchItem[] }>;
  preview: null | { eyebrow: string; title: string; strip: Strip; text: string; href: string };
  suggestion: string | null;
};

export type NextRow = {
  code: string;
  name: string;
  meta: string;
  ects: number;
  recommendPct: number | null;
  hours: string;
  difficulty: string;
  prereq: { name: string; status: string; ok: boolean } | null;
  detail: {
    eyebrow: string;
    strip: Strip;
    cohorts: Array<{ title: string; line: string; note: string; ok: boolean; pct: number | null; face: string | null }>;
  };
};
export type NextData = { eyebrow: string; title: string; dates: Array<{ title: string; note: string }>; rows: NextRow[]; lmsHref: string; note: string };

export type SettingsData = {
  account: { name: string; line: string };
  lms: { line: string };
  telegram: { linked: boolean; line: string; href: string };
  alerts: Array<{ id: string; title: string; note: string; on: boolean }>;
  credit: string;
};

export type RateData = {
  course: { id: string; name: string; term: string; href: string };
  teachers: Array<{ id: string; name: string; role: string; face: string | null }>;
  tags: string[];
  initial: null | { recommend: "yes" | "unsure" | "no" | null; hours: string | null; difficulty: number | null; tags: string[]; pressed: string[] };
};

export type ProfessorsData = {
  filters: Array<{ id: string; label: string; href: string; on: boolean }>;
  items: Array<{ id: string; name: string; face: string | null; dept: string; courses: string; pct: number | null; count: number; href: string }>;
};

export type CurriculumData = {
  program: string;
  line: string;
  years: Array<{ label: string; semesters: Array<{ label: string; ects: number; courses: Array<{ code: string; name: string; ects: number; status: "passed" | "now" | "next" | "later"; href: string }> }> }>;
};
