import type { Catalog, Course, Teacher } from "@/lib/catalog";
import type { SyllabusData } from "@/lib/db/schema";

export const teacher = (id: string, extra: Partial<Teacher> = {}): Teacher => ({
  id, name: id.toUpperCase(), display_name: id.replace("-", " "), previous_ids: [], position: "Lecturer",
  department: "Mathematics", school: "humanities", email: `${id.replace("-", ".")}@newuu.uz`,
  office: null, photo_url: null, url: null, teaches: [], ...extra,
});

export const course = (code: string, subject: string, extra: Partial<Course> = {}): Course => ({
  code, subject, aliases: [], same_name_codes: [], teachers: [], classes: [], ...extra,
});

/** A small catalog: two teachers and four courses, seeded into the LMS tables by seedCatalog. */
export const catalog: Pick<Catalog, "teachers" | "courses"> = {
  teachers: [
    teacher("g-pinto", { display_name: "Gonçalo Pinto", teaches: ["MATH111", "MATH211"] }),
    teacher("e-carter", { display_name: "Emily Carter", teaches: ["PHYS101"] }),
  ],
  courses: [
    course("MATH101", "Precalculus"),
    course("MATH111", "Calculus 1", { teachers: ["g-pinto"] }),
    course("MATH211", "Calculus 2", { teachers: ["g-pinto"] }),
    course("PHYS101", "Physics 1", { teachers: ["e-carter"] }),
  ],
};

export const syllabus = (extra: Partial<SyllabusData> = {}): SyllabusData => ({
  course_code: "MATH 111", course_title: "Calculus 1", term: "Fall 2024", academic_year: "2024/2025",
  credits: 3, ects: 6, total_hours: 180, contact_hours_per_week: { lectures: 3, tutorials: 2, labs: null, raw: "" },
  prerequisites: { status: "listed", groups: [{ any_of: [{ text: "Precalculus", code: "" }] }] },
  description: "Limits, derivatives and integrals.",
  learning_outcomes: ["Compute derivatives"],
  assessment: [{ name: "Final Exam", weight_percent: 40, timing: "TBA" }, { name: "Midterm Exam", weight_percent: 30, timing: "Week 8" }, { name: "Assignments", weight_percent: 30, timing: "" }],
  workload: [{ activity: "In-Class Time", hours: 90 }, { activity: "Independent Study", hours: 90 }],
  instructors: [{ name: "Gonçalo Pinto", position: "Professor", email: "g.pinto@newuu.uz", office: "B25", office_hours: "Mon 12pm" }],
  books: [{ title: "Calculus", authors: "James Stewart", edition: "9th", kind: "required" }],
  topics_by_week: Array.from({ length: 16 }, (_, i) => ({ week: String(i + 1), topic: `Topic ${i + 1}` })),
  tools: [], attendance_policy: "Attendance is compulsory.", late_work_policy: "", ...extra,
});
