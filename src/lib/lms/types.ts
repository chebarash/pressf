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
  last_name?: string;
  sur_name?: string;
};
