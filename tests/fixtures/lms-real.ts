/**
 * Anonymised copies of real hero.study responses (captured Nov 2026 from a
 * signed-in student, GET only). Names, marks, ids and texts are made up; the
 * SHAPES are real: field names, nesting, string-vs-number types, the
 * `_en/_ru/_uz/_kz/_card` name variants, lists where one would expect an
 * object, and the placeholders the LMS sends (`final_grade` 0 in a running
 * semester, "System notification" as the author). Keep it that way when
 * editing: these are what the parsers were wrong about.
 */

const names = (first: string, sur: string, last = "") => ({
  first_name_kz: first, first_name_ru: first, first_name_en: first, first_name_card: first,
  last_name_kz: last, last_name_ru: last, last_name_en: last, last_name_card: last,
  sur_name_kz: sur, sur_name_ru: sur, sur_name_en: sur, sur_name_card: sur,
});

/** `/gradebook/semesters-list`: not in date order, and without the first study year (ids 10, 11). */
export const gradebookSemesters = [
  { id: 2940, department_id: 2, learner_id: 593, semester_id: 13, work_education_plan_id: 7, status: 1, year_of_study: 2, semesters_semester_id: 13, semester_name: "Fall 2024", study_start: 1724612400, study_end: 1736794740, is_open: 0, limit_absence_all: 25 },
  { id: 6319, department_id: 2, learner_id: 593, semester_id: 178, work_education_plan_id: 7, status: 1, year_of_study: 3, semesters_semester_id: 178, semester_name: "Fall 2025", study_start: 1756666800, study_end: 1768417140, is_open: 0, limit_absence_all: 25 },
  { id: 12982, department_id: 2, learner_id: 593, semester_id: 181, work_education_plan_id: 7, status: 1, year_of_study: 4, semesters_semester_id: 181, semester_name: "Fall (2026-2027)", study_start: 1788721200, study_end: 1800212340, is_open: 1, limit_absence_all: 25 },
  { id: 3003, department_id: 2, learner_id: 593, semester_id: 14, work_education_plan_id: 7, status: 1, year_of_study: 2, semesters_semester_id: 14, semester_name: "Spring 2025", study_start: 1737918000, study_end: 1749754740, is_open: 0, limit_absence_all: 25 },
  { id: 10256, department_id: 2, learner_id: 593, semester_id: 179, work_education_plan_id: 7, status: 1, year_of_study: 3, semesters_semester_id: 179, semester_name: "Spring 2026", study_start: 1769367600, study_end: 1781290740, is_open: 0, limit_absence_all: 25 },
  { id: 6975, department_id: 2, learner_id: 593, semester_id: 180, work_education_plan_id: 7, status: 1, year_of_study: 3, semesters_semester_id: 180, semester_name: "Summer (2025-2026)", study_start: 1781895600, study_end: 1786561140, is_open: 0, limit_absence_all: 25 },
];

const employee = (id: string, subjectId: string, first: string, sur: string, type: string, employeeType: string) => ({
  employee_id: id, subject_id: subjectId, id: `9${id}`, ...names(first, sur), image_version: "", image_extension: "", type, employee_type: employeeType, imagesUrls: [],
});

/** `/subject/my-list?lang=en`: strings everywhere; the upcoming semester keeps its Russian name. */
export const myList = {
  semesters: [
    { work_education_plan_id: "7", semester_id: "10", count_credit: "30", external_id: "", id: "10", year_id: "4", type: "1", is_open: "0", sort: "1", status: "1", name: "Fall 2023", year: { id: "4", start: "2023", end: "2024", deleted: "0", current: "0", external_id: "" }, subjects: [] },
    { work_education_plan_id: "7", semester_id: "11", count_credit: "30", external_id: "", id: "11", year_id: "4", type: "2", is_open: "0", sort: "2", status: "1", name: "Spring 2024", year: { id: "4", start: "2023", end: "2024", deleted: "0", current: "0", external_id: "" }, subjects: [] },
    { work_education_plan_id: "7", semester_id: "13", count_credit: "30", external_id: "", id: "13", year_id: "5", type: "1", is_open: "0", sort: "1", status: "1", name: "Fall 2024", year: { id: "5", start: "2024", end: "2025" }, subjects: [] },
    {
      work_education_plan_id: "7", semester_id: "181", count_credit: "42", external_id: "", id: "181", year_id: "61", type: "1", is_open: "1", sort: "1", status: "1", name: "Fall (2026-2027)", year: { id: "61", start: "2026", end: "2027" },
      subjects: [
        {
          work_education_plan_id: "7", semester_id: "181", subject_id: "906", id: "1349", ects_count: "0",
          subject: {
            id: "906", name: "Neural Networks", imagesUrls: [],
            employee: [employee("141", "906", "Aziza", "Karimova", "0", "Lecture"), employee("215", "906", "Bekzod", "Tursunov", "2", "Laboratory"), { ...employee("", "906", "", "", "", "Other."), employee_id: "" }],
          },
        },
      ],
    },
    { work_education_plan_id: "7", semester_id: "182", count_credit: "", external_id: "", id: "182", year_id: "61", type: "2", is_open: "2", sort: "2", status: "1", name: "Весенний (2026-2027)", year: { id: "61", start: "2026", end: "2027" }, subjects: [] },
  ],
  currentSubject: [],
  count: 1,
  currentCount: 1,
};

const mark = (m: number, type: number, subjectId: number, ratingId: number | null = 11) => ({ mark: m, type, load_id: 520, subject_id: subjectId, rating_date: ratingId ? 1798225140 : null, rating_id: ratingId, positive_status: m >= 50 });

/** A gradebook class: `time` is when it was marked, `schedule[0].begin_time` when it took place. */
const event = (o: { id: number; subject: number; lesson: string; n: number; type: number; status: number; qr: number; time: number | null; begin: number; mark?: number | null }) => ({
  id: o.id, gradebook_id: 78931, learner_id: 593, mark: o.mark ?? null, status: o.status, user_id: null, updated_at: 1789464404, created_at: 1789464404, deleted: 0,
  absence_id: null, time: o.time, siw_mark: null, is_quiz: 0, previous_status: null, qr_auto_set_status: o.qr, appeal_start: null, change_source: "manual",
  schedule_id: null, stream_id: 3208, employee_id: null, lesson_id: 52000 + o.id, comment: null, commentType: null, is_siw: 0, stream_name: "SeSE3",
  subject_id: o.subject, subject_name: "Neural Networks", image_extension: null, image_version: null,
  first_name_ru: null, last_name_ru: null, sur_name_ru: null, first_name_en: null, last_name_en: null, sur_name_en: null,
  lesson_number: o.n, lesson_type: o.type, lesson_name: o.lesson, language_department_id: null, absence: [],
  schedule: [{ id: 55000 + o.id, load_id: 520, begin_time: o.begin, end_time: o.begin + 3300, subject_id: o.subject, employee_id: 141, event_type: 4, subject_control_id: 2, ...names("Aziza", "Karimova"), subject_control_name: "Mid Term Exam" }],
  is_remediation: 0, absence_number: null, absence_period: null, absence_type: null,
});

const admit = (subjectId: number, o: { admit: number; lessons: number; missed: number; left: number; description: string }) => ({
  admit: o.admit, subject_id: subjectId, learner_id: 593, semester_id: 181, admit_type: 5, extend_absence: 0, personal_admit: 0, id: subjectId, department_id: 17, name: "Neural Networks",
  admit_description: o.description, allPercent: 11, noReasonPercent: 11, lessons_count: o.lessons, absence_count_all: o.missed, absence_count_no_reason: o.missed,
  avaibale_count_all: o.left, avaibale_count_no_reason: o.left, avaibale_percent_all: 13, avaibale_percent_no_reason: 13,
});

/** `/gradebook/gradebook-data?semester_id=181` (running): marks are lists per rating period, the final a 0 placeholder. */
export const gradebookOpen = {
  resultSubjects: {
    "906": {
      subject: { name: "Neural Networks", short_name: null, load_id: 520, module: null, department_id: 20, imagesUrls: [], employee: { "141": "Karimova Aziza ", "215": "Tursunov Bekzod " } },
      events: [
        event({ id: 1, subject: 906, lesson: "Lecture № 1", n: 1, type: 0, status: 1, qr: 1, time: 1789900000, begin: 1789898400 }),
        event({ id: 2, subject: 906, lesson: "Lecture № 2", n: 2, type: 0, status: 2, qr: 1, time: 1790510000, begin: 1790503200 }),
        event({ id: 3, subject: 906, lesson: "Lab № 1", n: 1, type: 2, status: 3, qr: 1, time: 1790600000, begin: 1790589600 }),
        event({ id: 4, subject: 906, lesson: "Lab № 2", n: 2, type: 2, status: 4, qr: 0, time: 1791200000, begin: 1791194400 }),
        event({ id: 5, subject: 906, lesson: "Tutorial № 1", n: 1, type: 1, status: 1, qr: 0, time: 1791300000, begin: 1791280800, mark: 8 }),
        event({ id: 6, subject: 906, lesson: "Lecture № 15", n: 15, type: 0, status: 0, qr: 0, time: null, begin: 1793788200 }),
      ],
      average: [mark(100, 4, 906)],
      rk: [mark(42, 5, 906)],
      rating: [mark(33, 0, 906)],
      rd: mark(33, 2, 906, null),
      admit: admit(906, { admit: 1, lessons: 60, missed: 8, left: 7, description: "Permit" }),
      e: { mark: 0, type: 1, load_id: 520, subject_id: 906, rating_date: null, rating_id: null, positive_status: false },
      fx: false,
      final_grade: { mark: 0, subject_id: 906, positive_status: false },
      siw_average: [mark(0, 6, 906)],
    },
    "894": {
      subject: { name: "Graduation Project 1 / Internship 1", short_name: null, load_id: false, module: null, department_id: 20, imagesUrls: [], employee: [] },
      events: [],
      average: [], rk: [], rating: [], rd: {}, siw_average: [],
      admit: admit(894, { admit: 0, lessons: 0, missed: 0, left: 0, description: "The EL score is insufficient. Minimum EL = " }),
      e: {}, fx: false, final_grade: {},
    },
  },
  calendar_ratings: [{ semester_calendar_id: 15, id: 11, date: 1798225140, name: "Mid Term Exam", subject_control_id: 2, type: 0, intermediate_control_id: 1, final_control_type: 1 }],
  load_controls: null,
  settings: null,
};

/** `/gradebook/gradebook-data?semester_id=179` (closed): real finals, a failed one included. */
export const gradebookClosed = {
  resultSubjects: {
    "718": {
      subject: { name: "Ethics", short_name: null, load_id: 345, module: null, department_id: 17, imagesUrls: [], employee: { "118": "Rashidov Timur " } },
      events: [],
      average: [mark(50, 4, 718, 8)], rk: [mark(92, 5, 718, 8)], rating: [mark(75, 0, 718, 8)], rd: mark(75, 2, 718, null),
      admit: admit(718, { admit: 1, lessons: 60, missed: 3, left: 12, description: "Permit" }),
      e: { mark: 0, type: 1, load_id: 345, subject_id: 718, rating_date: null, rating_id: null, positive_status: false },
      fx: false, final_grade: { mark: 0, subject_id: 718, positive_status: false }, siw_average: [mark(0, 6, 718, 8)],
    },
    "742": {
      subject: { name: "Network Security", short_name: null, load_id: 351, module: null, department_id: 20, imagesUrls: [], employee: { "129": "Yusupova Dilnoza ", "141": "Karimova Aziza " } },
      events: [],
      average: [mark(75, 4, 742, 8)], rk: [mark(59.02, 5, 742, 8)], rating: [mark(69, 0, 742, 8)], rd: mark(69, 2, 742, null),
      admit: admit(742, { admit: 1, lessons: 60, missed: 5, left: 10, description: "Permit" }),
      e: { mark: 36, type: 1, load_id: 351, subject_id: 742, rating_date: null, rating_id: null, positive_status: false },
      fx: false, final_grade: { mark: 57, subject_id: 742, positive_status: true }, siw_average: [mark(95, 6, 742, 8)],
    },
  },
  calendar_ratings: [], load_controls: [], settings: { extend_limit_absence: 1 },
};

/** `/gradebook/gradebook-data?semester_id=10`: first year, absent from semesters-list; older shapes (`e: {}`, employee `[]`). */
export const gradebookFirstYear = {
  resultSubjects: {
    "15": { subject: { name: "Digital Literacy", short_name: null, load_id: 12, module: null, department_id: 3, imagesUrls: [], employee: [] }, events: [], average: [], rk: [], rating: [], rd: {}, siw_average: [], admit: null, e: {}, fx: false, final_grade: { mark: 80, subject_id: 15, positive_status: true } },
    "240": { subject: { name: "Calculus I", short_name: null, load_id: 14, module: null, department_id: 4, imagesUrls: [], employee: [] }, events: [], average: [], rk: [], rating: [], rd: {}, siw_average: [], admit: null, e: {}, fx: false, final_grade: { mark: 45, subject_id: 240, positive_status: false } },
  },
  calendar_ratings: [], load_controls: [], settings: null,
};

/** `/transcript/learner`: the GPA and ECTS as strings under `transcript`; no per-semester GPA anywhere. */
export const transcript = {
  transcript: { id: "609", transcript_template_id: "1", learner_id: "593", number: "609", gpa: "3.12", ects: "176", diploma_with_honor: "0", ects_all: "188", transcriptTemplate: { id: "1", name: "Template 1", gpa_type: "1" } },
  learner: {},
  university: {},
};

const notification = (id: number, title: string, at: number, o: { read?: number; required?: number; acquainted?: number; author?: string } = {}) => ({
  id, type_id: 2, category_id: null, advertise_id: id - 90000, user_id: 1125, user_from_id: null, status: 1, created_at: at, updated_at: at,
  acquainted: o.acquainted ?? 1, read: o.read ?? 1, publicate_at: at, remind_at: null, required: o.required ?? 1, title, body: `<p>Dear students!</p>\r\n\r\n<p>${title}.</p>`,
  picture_type: 1, author: o.author ?? "System notification", author_photo: null,
});

/** `/notification/get-notification`: the latest 50 only (no paging), every item in `all` and in its own tab. */
export const notifications = (() => {
  const advertise = [
    notification(90617, "Review sessions this week", 1792869595, { read: 0, acquainted: 0 }),
    notification(90500, "No classes on 1 October", 1790000000),
  ];
  const pollsEvent = [notification(90700, "Course feedback poll", 1792900000, { read: 0, required: 0, author: "DILNOZA YUSUPOVA" })];
  return { all: [...advertise], advertise, advertise_required: [], notification: [], polls_event: pollsEvent, offer: [] };
})();

/** `/schedule/list`: grouped by day; the room is `auditorium.aud_num`, the teacher `employee.person`. */
export const scheduleDays = [
  { day: "02.11.26", type: "#3c78d8", events: [{
    id: "55640", begin_time: "1793608200", end_time: "1793611500", subject_id: "906", auditorium_id: "13", semester_id: "181", employee_id: "141", lesson_id: "52681", event_type: "4",
    subjectType: { id: "5", type: "0", name: "Lecture", color: "#3c78d8", short_name: "Lec" },
    auditorium: { id: "13", size: "80", campus_id: "2", aud_num: "306", campus: { id: "2", name: "Main", num: "1", address: "" } },
    employee: { id: "141", person: names("Aziza", "Karimova") },
  }] },
];

/** `/subject/get-by-id`: `employee[]` has no role; each lesson has its type and the teacher of its slot. */
export const subjectById = {
  id: "906", name: "Neural Networks", code: "CS412", deleted: "0", credit_count: "6",
  employee: [{ employee_id: "141", ...names("Aziza", "Karimova") }, { employee_id: "214", ...names("Sardor", "Aliev") }, { employee_id: "215", ...names("Bekzod", "Tursunov") }],
  lessons: [
    { id: "1", name: "Lecture 1", lesson_type_id: "5", lessonType: { name: "Lecture", short_name: "Lec" }, schedule: [{ begin_time: "1789898400", end_time: "1789901700", employee_id: "141" }] },
    { id: "2", name: "Lab 1", lesson_type_id: "4", lessonType: { name: "Laboratory", short_name: "Lab" }, schedule: [{ begin_time: "1790589600", end_time: "1790592900", employee_id: "215" }] },
  ],
};

/** `/homework/list`: no `id`, and the status name stays Russian with `lang=en`. */
export const homework = {
  count_items: "1", count_pages: "1", limit: "50", offset: "0",
  data: [{ homework_id: "114", form_type: "1", homework_working_id: "26651", theme_name: "HW3", time: "1793750400", rating: "", status_id: "1", status_name: "Не готово", subject: { id: "906", name: "Neural Networks" } }],
};
