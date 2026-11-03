/** The catalog shapes, built from the harvested LMS tables (see ./index.ts). */
export type Teacher = {
  id: string;
  name: string;
  display_name: string;
  previous_ids: string[];
  position: string | null;
  department: string | null;
  school: string | null;
  email: string | null;
  office: string | null;
  photo_url: string | null;
  url: string | null;
  teaches: string[];
};

export type Course = {
  code: string;
  subject: string;
  aliases: string[];
  same_name_codes: string[];
  teachers: string[];
  classes: string[];
};

export type Lesson = {
  class: string;
  day: number;
  starts: string;
  ends: string;
  subject: string;
  code: string;
  teacher: string | null;
  teacher_name: string | null;
  room: string | null;
  /** Lecture, lab, practice… from the LMS class type; absent in caches written before it was kept. */
  kind?: import("@/core/agenda").ClassKind;
};

export type Program = { slug: string; name: string; degree: string };
export type School = { slug: string; name: string; programs: Program[] };

export type CurriculumCourse = {
  code: string;
  subject: string;
  credits: number | null;
  type: "core" | "elective";
  elective_group: string | null;
  prerequisites: string[] | null;
};
export type CurriculumSemester = {
  number: number;
  year: number;
  term: "fall" | "spring" | null;
  courses: CurriculumCourse[];
};
export type Curriculum = {
  program: string;
  source_url: string | null;
  academic_year: string | null;
  semesters: CurriculumSemester[];
};

export type Catalog = {
  teachers: Teacher[];
  courses: Course[];
  schools: School[];
  curricula: Record<string, Curriculum>;
};
