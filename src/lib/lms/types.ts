/**
 * Shapes returned by the hero.study API, narrowed to the fields Press F uses.
 * Checked against real responses (Nov 2026); the anonymised copies the tests
 * use live in tests/fixtures/lms-real.ts. Every call asks for `lang=en`
 * (client.ts); name fields come in `_en/_ru/_uz/_kz/_card` variants and an
 * empty English one falls back to the others (core/people `localized`).
 */

/** `first_name_*` given name, `sur_name_*` family name, `last_name_*` patronymic (usually empty). */
export type LmsEmployee = {
  employee_id: string;
  first_name_en?: string;
  first_name_ru?: string;
  first_name_uz?: string;
  last_name_en?: string;
  last_name_ru?: string;
  sur_name_en?: string;
  sur_name_ru?: string;
  sur_name_uz?: string;
  /**
   * Teaching role, only in `/subject/my-list`: "Lecture", "Tutorial",
   * "Laboratory" or "Other." (independent work). `/subject/get-by-id` leaves it
   * out; the harvest reads roles from the lessons instead.
   */
  employee_type?: string;
  /** Lesson-type id matching `employee_type`: "0" lecture, "1" tutorial, "2" lab, "5" independent work. */
  type?: string;
};

/** Rich teacher profile from `/employee/get-by-id`; most fields may be empty strings. */
export type LmsEmployeeDetail = {
  employee_id?: string;
  user_id?: string;
  first_name_en?: string;
  last_name_en?: string;
  sur_name_en?: string;
  /** Position/title lives in `academicStatus.name` (the object, not a string). */
  academicStatus?: { name?: string } | null;
  /** School → department chain (object or list), read for the department name. */
  departmentTree?: unknown;
  /** Degrees and publications; shapes vary, parsed leniently in the harvest. */
  education?: unknown;
  publications?: unknown;
  science_direction?: string | null;
  // `imagesUrls` (the real photo) is deliberately not typed: Press F never stores or shows it.
};

export type LmsSubjectSummary = {
  id: string;
  name: string;
  code?: string;
  employee?: LmsEmployee[];
};

export type LmsSemester = {
  id: string;
  semester_id?: string;
  /** English with `lang=en`; still Russian ("Весенний (2026-2027)") when the LMS has no English name. */
  name: string;
  /** 0 past, 1 current, 2 future. */
  is_open: string;
  year?: { start?: string; end?: string };
  subjects: Array<{ id: string; subject_id: string; subject: LmsSubjectSummary }>;
};

export type LmsMyList = {
  semesters: LmsSemester[];
};

export type LmsMaterial = {
  id: string;
  name: string;
  file_extension?: string;
  file_version?: string;
  created_at?: string;
  updated_at?: string;
  /** Relative path under the API origin; needs the Bearer token to download. */
  fileFullUrl?: string;
};

export type LmsLesson = {
  id: string;
  name: string;
  lesson_type_id?: string;
  lessonType?: { name?: string; short_name?: string; color?: string };
  subject_id?: string;
  schedule?: Array<{
    begin_time?: string;
    end_time?: string;
    employee_id?: string;
    campus?: string;
    auditorium?: string;
    employee?: LmsEmployee;
  }>;
};

export type LmsLessonFull = LmsLesson & {
  lessonMaterials?: LmsMaterial[];
  lessonVideoMaterials?: LmsMaterial[];
  books?: unknown[];
  booksRecommended?: unknown[];
  links?: unknown[];
};

export type LmsDepartment = {
  id: string;
  code?: string;
  parent_id?: string;
  department_type_id?: string;
  name: string | null;
  short_name?: string;
};

export type LmsProgram = {
  id: string;
  name: string;
  department_id?: string;
  education_program_group_id?: string;
  description?: string;
};

export type LmsSubject = {
  id: string;
  /** Null for some records (e.g. deleted placeholders). */
  name: string | null;
  code: string;
  /** "1" for records the LMS has deleted. */
  deleted?: string;
  credit_count?: string;
  lecture_hours?: string;
  laboratory_hours?: string;
  practice_hours?: string;
  semester_id?: string;
  department?: { id: string; name: string | null; short_name?: string };
  employee?: LmsEmployee[];
  lessons?: LmsLesson[];
};

export type LmsUser = {
  id: string;
  email: string;
  username?: string;
  role?: string;
  /** NewUU stores the given name in `username`, the family name in `sur_name`. */
  last_name?: string;
  sur_name?: string;
  avatar_version?: string;
  avatar_extension?: string;
};

export type LmsScheduleEvent = {
  begin_time?: string;
  end_time?: string;
  subject_id?: string;
  employee_id?: string;
  /** A room string, or an object: real rows carry `aud_num` ("306") and `campus.name`, no `name`. */
  auditorium?: string | { name?: string | null; aud_num?: string | number | null; campus?: { name?: string } | null } | null;
};

export type LmsScheduleDay = { day?: string; events?: LmsScheduleEvent[] };

/** A row of the student's individual education plan: one semester of their program. */
export type LmsIepRow = {
  work_education_plan_id?: string;
  education_program_id?: string;
  semester_id?: string;
  year_of_study?: string;
  subjects?: Array<{ subject_id?: string; id?: string; code?: string; name?: string; ects?: string; /** "3" for a pass/fail course (graded P on the transcript). */ rating_passed?: string }>;
};

export type LmsTranscript = {
  gpa?: string;
  /** ECTS earned and the plan total. */
  ects?: string;
  ects_all?: string;
  diploma_with_honor?: string;
};

export type LmsGradebookSemester = {
  id: number;
  semester_id: number;
  semester_name?: string;
  year_of_study?: number;
  study_start?: number | string;
  study_end?: number | string;
  is_open?: number;
};

/**
 * One mark entry; `mark` is 0–100, `positive_status` is pass/fail. `type`:
 * 0 rating, 1 exam (`e`), 2 admission rating (`rd`), 4 current average, 5
 * midterm (`rk`), 6 independent work (`siw_average`).
 */
export type LmsMark = { mark?: number | null; type?: number; rating_id?: number | null; positive_status?: boolean };

/**
 * A row of `/gradebook/gradebook-data`. The per-period columns (`average`,
 * `rating`, `rk`, `siw_average`) are lists, one entry per rating period; `rd`,
 * `e` and `final_grade` are single objects. In a running semester
 * `final_grade` is `{ mark: 0, positive_status: false }` until the exam.
 */
export type LmsGradebookSubject = {
  subject?: {
    name?: string;
    load_id?: number | false;
    department_id?: number;
    /** `{ "118": "Family Given " }` on recent semesters, `[]` on older ones. */
    employee?: Record<string, string> | unknown[];
  };
  final_grade?: LmsMark | null;
  e?: LmsMark | null;
  rd?: LmsMark | null;
  average?: LmsMark[] | LmsMark | null;
  rating?: LmsMark[] | LmsMark | null;
  rk?: LmsMark[] | LmsMark | null;
  siw_average?: LmsMark[] | LmsMark | null;
  fx?: boolean | LmsMark | null;
};

export type LmsGradebookRow = LmsGradebookSubject & { admit?: LmsAdmit; events?: LmsAttendanceEvent[] };

export type LmsGradebookData = {
  /** Keyed by subject id; `[]` when the semester has no courses yet. */
  resultSubjects?: Record<string, LmsGradebookRow> | unknown[];
};

export type { LmsAdmit, LmsAttendanceEvent } from "@/core/attendance";
import type { LmsAdmit, LmsAttendanceEvent } from "@/core/attendance";
import type { LmsNotification } from "@/core/notifications";

/** `/notification/get-notification`: the LMS bell, split into tabs. */
export type LmsNotificationsPayload = {
  all?: LmsNotification[];
  notification?: LmsNotification[];
  advertise?: LmsNotification[];
  advertise_required?: LmsNotification[];
  offer?: LmsNotification[];
  polls_event?: LmsNotification[];
};

export type LmsHomework = {
  /** Real rows have no `id`: `homework_working_id` is the student's copy, `homework_id` the task. */
  id?: string | number;
  homework_id?: string | number;
  homework_working_id?: string | number;
  subject?: string | { name?: string };
  theme_name?: string;
  /** Deadline, unix seconds. */
  time?: number | string;
  status_id?: number | string;
  /** Russian even with `lang=en` ("Не готово"). */
  status_name?: string;
  rating?: number | string | null;
};
