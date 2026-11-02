/** Shapes returned by the hero.study API, narrowed to the fields Press F uses. */

export type LmsEmployee = {
  employee_id: string;
  first_name_en?: string;
  first_name_ru?: string;
  last_name_en?: string;
  last_name_ru?: string;
  sur_name_en?: string;
  sur_name_ru?: string;
  /** Teaching role for this course: "Lecture", "Laboratory", "Practice", … */
  employee_type?: string;
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
};

export type LmsSubjectSummary = {
  id: string;
  name: string;
  code?: string;
  employee?: LmsEmployee[];
};

export type LmsSemester = {
  id: string;
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
  name: string;
  code: string;
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

/** A row of the student's individual education plan: one semester of their program. */
export type LmsIepRow = {
  work_education_plan_id?: string;
  education_program_id?: string;
  semester_id?: string;
  year_of_study?: string;
  subjects?: Array<{ subject_id?: string; id?: string; code?: string; name?: string; ects?: string }>;
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
  study_start?: string;
  study_end?: string;
  is_open?: number;
};

/** One mark entry; `mark` is 0–100, `positive_status` is pass/fail. */
export type LmsMark = { mark: number | null; positive_status?: boolean };

export type LmsGradebookSubject = {
  subject?: { name?: string; load_id?: number; department_id?: number };
  final_grade?: LmsMark | null;
  e?: LmsMark | null;
  fx?: boolean;
};

export type LmsGradebookData = {
  resultSubjects?: Record<string, LmsGradebookSubject>;
};
