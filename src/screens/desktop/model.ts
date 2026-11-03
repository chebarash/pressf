/**
 * Display shapes the desktop screens draw. Each screen takes its view model from
 * src/server/views as `data` and maps it here with ./adapt, so the layout code
 * reads like the Figma frame and the mapping lives in one place.
 */
import type { TeacherRole } from "@/core/ratings";
import type { SyllabusFold } from "@/server/views";
import type { RatingSummaryProps } from "@/ui/components";
import type { FeedFilesVM, FeedKind, FeedMarkVM, FileRowData, Strip, Tier } from "./parts";

export type { FeedFilesVM, FeedKind, FeedMarkVM, FileRowData, Strip, Tier };

export type Teacher = { id: string; name: string; face: string | null; href: string };

export type CourseCardVM = { code: string; name: string; href: string; recommendPct: number | null; teacher: { name: string; face: string | null } | null; line: string };

export type FeedItemVM = {
  id: string;
  kind: FeedKind;
  title: string;
  meta: string;
  unread: boolean;
  href: string;
  section?: string;
  eyebrow?: string;
  body?: string[];
  needsAck?: boolean;
  /** The LMS asked for a confirmation and opening it gave it. */
  acknowledged?: boolean;
  /** Where "Open …" goes from the detail pane. */
  open?: { label: string; href: string } | null;
  /** New-files items: the files (at most three, each opens the file) and "and N more" to the course's files. */
  files?: FeedFilesVM | null;
  /** Grade and attendance items: the score in its tier, or the class, its mark and the absences left. */
  mark?: FeedMarkVM | null;
};


export type TodayData = {
  /** Status line under the header (Figma D15: LMS not answering). */
  banner?: { text: string; tone: "info" | "warning"; action: { label: string; href: string } | null } | null;
  greeting: string;
  title: string;
  dateLine: string;
  next: null | { label: string; title: string; line: string; href: string; files: FileRowData[]; note: string | null };
  day: Array<{ time: string; title: string; meta: string; tone: "class" | "next" | "deadline"; href?: string }>;
  /** The red now-line goes before `day[before]`. */
  now: { time: string; before: number } | null;
  /** `loading`: LMS down with nothing cached (D15 skeletons). */
  feed: { unread: number; items: FeedItemVM[]; loading?: boolean };
  due: Array<{ title: string; meta: string; status: string; late: boolean; href?: string }>;
  exam: null | { when: string; title: string; meta: string; href?: string };
  courses: CourseCardVM[];
  rate: null | { eyebrow: string; title: string; text: string; href: string; term: string | null };
};

export type ClassTone = "teal" | "mustard" | "plum" | "moss" | "rust" | "sky" | "rose" | "sand";
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
  /** `loaded`: the view sent this day's classes; other days link to themselves. */
  days: Array<{ label: string; today: boolean; href: string; count: number; loaded: boolean }>;
  startHour: number;
  endHour: number;
  now: { day: number; minutes: number } | null;
  classes: TimetableClass[];
  selected: string | null;
  empty: string | null;
};

export type CourseListItem = { code: string; name: string; href: string; recommendPct: number | null; next: string; absences: string | null; /** An earlier semester's course: that semester ("Fall 2025"). */ term?: string };
export type CoursesData = {
  terms: Array<{ id: string; label: string; href: string; active: boolean }>;
  courses: CourseListItem[];
  cards: CourseCardVM[];
  note: string | null;
};

export type Mention = { date: string; text: string; tag: string; href: string };
export type CourseData = {
  code: string;
  name: string;
  kind: string | null;
  term: { label: string; options: Array<{ label: string; href: string; selected?: boolean }> };
  strip: Strip;
  tabs: { overview: string; files: number; anonymous: number; filesHref: string; anonymousHref: string };
  /** Overview: only weeks with a topic or files, up to three around this week. */
  weeks: Array<{ n: number; title: string; current: boolean; files: FileRowData[] }>;
  /** Files the LMS gave no week (shown as "Other files"). */
  otherFiles?: FileRowData[];
  /** Files tab: every file with its week, and the week topics. */
  files?: Array<FileRowData & { week: number | null }>;
  topics?: Record<number, string>;
  /** Query the tabs carry along ("term=…&list=…"). */
  tabQuery?: string;
  /** Anonymous tab: the latest posts that mention the course. */
  posts?: Mention[];
  weeksTotal: number;
  filesTotal: number;
  teachers: Array<Teacher & { line: string; pressFPct: number | null }>;
  grading: Array<{ pct: number; title: string; note: string }>;
  syllabus: Array<{ title: string; meta: string; href?: string }>;
  /** The syllabus as folds (grading open, the rest one click away), same as mobile 4.2. */
  syllabusFold?: SyllabusFold | null;
  me: null | { average: number | null; tier: Tier; line: string; next: string | null; href: string };
  summary: RatingSummaryProps | null;
  mention: Mention | null;
  rateHref: string | null;
  /** The rate button: "Rate this course" / "Edit your rating"; `opensIn` = disabled until that teaching week. */
  rate?: { label: string; opensIn: number | null } | null;
  /** The student's courses for the list pane, when the view sends them. */
  myCourses: CourseListItem[] | null;
  terms: CoursesData["terms"] | null;
  locked: boolean;
  /** Next to a file (D12): only the file's week and teachers, with a link to the full course. */
  context?: boolean;
};

export type FileData = {
  file: null | {
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
  courseLink: { name: string; href: string } | null;
};

export type ProfessorData = {
  crumbs: Array<{ label: string; href?: string }>;
  name: string;
  face: string | null;
  title: string;
  /** "Office 115", the email (mailto) and office hours, from newuu.uz or the admin. */
  contact: Array<{ label: string; href?: string }>;
  /** A short note from the admin. */
  note: string | null;
  stats: Array<{ value: string; label: string; accent?: boolean }>;
  schedule: { term: string; rows: Array<{ day: string; time: string; course: string; href: string; role: string; room: string }> };
  summary: RatingSummaryProps | null;
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
  /** When `next` is due (ISO), for sorting the Next column. */
  nextAt?: string | null;
  href: string;
  detail: null | {
    marks: Array<{ label: string; value: number | null; max: number; tier: Tier }>;
    /** Oldest first; one dot per class in the LMS gradebook. */
    classes: ClassDot[];
    classesLabel: string;
    grading: Array<{ label: string; value: string }>;
  };
};
export type ProgressData = {
  gpa: { value: string; delta: string; note: string; trend: number[] } | null;
  credits: { done: number; total: number; note: string } | null;
  /** `low`: the closest course is near its limit; the note turns rust (D6). */
  attendance: { value: string; note: string; low?: boolean } | null;
  week: { title: string; note: string } | null;
  rows: ProgressRow[];
  open: string | null;
  /** `href`: an earlier semester's results page (/progress/term/…). */
  semesters: Array<{ term: string; short: string; value: number | null; current: boolean; line: string; href?: string | null }>;
  rate: null | { title: string; line: string; href: string };
  empty: boolean;
};
/** D6 for an earlier semester: the 5.6 results (final mark and status per course), rating nudge, curriculum. */
export type TermResultsData = {
  title: string;
  sub: string;
  tiles: Array<{ label: string; value: string; note: string }>;
  rows: Array<{ id: string; name: string; meta: string; final: number | null; tier: Tier; status: string; statusTone: "ok" | "low" | "none"; ects: number | null; href: string | null }>;
  rate: null | { title: string; line: string; href: string };
  curriculum: { title: string; line: string; href: string };
};
/**
 * One class's attendance: attended (QR check-in or the teacher, one state), late,
 * absent, excused, or not marked yet (the LMS has the class but no mark).
 */
export type ClassState = "attended" | "late" | "absent" | "excused" | "unmarked";
export type ClassDot = { state: ClassState; title: string };
export type ClassLine = { key: string; lesson: string; kind: string; date: string | null; state: ClassState; score: number | null };
export type CourseProgressData = {
  course: { name: string; code: string; href: string; term: string | null; teacher: string | null };
  row: ProgressRow;
  /** Newest first, as the gradebook lists them. */
  classes: ClassLine[];
  /** Count per state, for the legend and the summary line. */
  counts: Record<ClassState, number>;
};

export type NotificationsData = { unread: number; items: FeedItemVM[]; open: string | null };

export type CalendarKind = "week" | "deadline" | "exam" | "registration" | "holiday" | "class";
export type CalendarMonth = {
  label: string;
  weeks: Array<Array<{ key: string; date: number; inMonth: boolean; today: boolean; items: Array<{ title: string; kind: CalendarKind; href?: string | null }> }>>;
  /** Multi-day events (exam weeks, registration) per week row: a bar from column `from` to `to` (0 = Mon) in lane `lane`. */
  spans?: Array<Array<{ key: string; title: string; kind: CalendarKind; href?: string | null; from: number; to: number; lane: number }>>;
};
export type CalendarData = {
  months: CalendarMonth[];
  filters: Array<{ id: string; label: string; on: boolean; href: string }>;
  coming: Array<{ title: string; meta: string; kind: CalendarKind }>;
  empty: string | null;
  icsHref: string;
};

export type SearchItem = { id: string; title: string; meta: string; right: string | null; href: string };
export type SearchData = {
  q: string;
  total: number;
  groups: Array<{ id: "courses" | "professors" | "files"; label: string; items: SearchItem[] }>;
  previews: Record<string, { eyebrow: string; title: string; strip: Strip; text: string; href: string }>;
  suggestion: string | null;
  /** Closest course name to a typo, shown as "Did you mean …?" (D17). */
  didYouMean?: string | null;
};

export type NextRow = {
  code: string;
  name: string;
  meta: string;
  ects: number | null;
  recommendPct: number | null;
  hours: string;
  difficulty: string;
  /** The numbers behind `hours` and `difficulty`, for sorting. */
  hoursValue?: number | null;
  difficultyValue?: number | null;
  prereq: { name: string; status: string; ok: boolean } | null;
  href: string | null;
  detail: {
    eyebrow: string;
    strip: Strip;
    cohorts: Array<{ title: string; line: string; note: string; ok: boolean; pct: number | null; face: string | null }>;
  };
};
export type NextData = { eyebrow: string; title: string; dates: Array<{ title: string; note: string }>; rows: NextRow[]; lmsHref: string; note: string; missing: boolean };

export type SettingsData = {
  account: { name: string; line: string };
  lms: { line: string };
  telegram: { linked: boolean; line: string; href: string };
  alerts: Array<{ id: string; title: string; note: string; on: boolean }>;
  credit: string;
};

export type RateData = {
  course: null | { id: string; name: string; term: string; href: string };
  waiting: number;
  /** /rate/<next waiting course>, or null when this is the last one. */
  nextHref?: string | null;
  teachers: Array<{ id: string; name: string; role: string; kind: TeacherRole; face: string | null }>;
  tags: string[];
  /** Saved answers when editing a rating; `pressed` and `teacherTags` are keyed by "teacherId|role". */
  initial: null | { recommend: "yes" | "unsure" | "no" | null; hours: string | null; difficulty: number | null; tags: string[]; pressed: string[]; teacherTags?: Record<string, string[]> };
};

export type ProfessorsData = {
  schools: string[];
  /** Departments with their school, for the second row of filters. */
  departments: Array<{ name: string; school: string | null }>;
  /** Filters from the URL (?school=, ?dept= slugs). */
  initial?: { school: string | null; dept: string | null };
  items: Array<{ id: string; name: string; face: string | null; dept: string; school: string | null; courses: string; pct: number | null; href: string; yours: boolean }>;
};

export type CurriculumData = {
  program: string;
  line: string;
  programs: Array<{ id: string; name: string; href: string; on: boolean }>;
  years: Array<{ label: string; semesters: Array<{ label: string; ects: number; courses: Array<{ code: string; name: string; ects: number | null; pct: number | null; status: "passed" | "failed" | "now" | "planned" | null; href: string | null }> }> }>;
};
