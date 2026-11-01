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

export const catalog: Omit<Catalog, "updatedAt"> = {
  teachers: [
    teacher("g-pinto", { display_name: "Gonçalo Pinto", teaches: ["MATH111", "MATH211"], office: "B-312" }),
    teacher("e-carter", { display_name: "Emily Carter", teaches: ["PHYS101"], department: null, school: null }),
  ],
  courses: [
    course("MATH101", "Precalculus"),
    course("MATH111", "Calculus 1", { teachers: ["g-pinto"], classes: ["FCS 1"] }),
    course("MATH211", "Calculus 2", { teachers: ["g-pinto"] }),
    course("PHYS101", "Physics 1", { teachers: ["e-carter"], classes: ["FCS 1"] }),
  ],
  timetable: [
    { class: "FCS 1", day: 0, starts: "10:00", ends: "11:20", subject: "Calculus 1", code: "MATH111", teacher: "g-pinto", teacher_name: "Gonçalo Pinto", room: "B-204" },
    { class: "FCS 1", day: 1, starts: "13:00", ends: "14:20", subject: "Physics 1", code: "PHYS101", teacher: "e-carter", teacher_name: "Emily Carter", room: "A-108" },
  ],
  groups: [
    { class: "FCS 1", program: "bsc-cyber-security", year: 1 },
    { class: "TESOL 1", program: null, year: null },
  ],
  semesters: {
    current: { id: "fall-2026", name: "Fall 2026", starts: "2026-09-07", ends: "2027-01-15" },
    next: { id: "spring-2027", name: "Spring 2027", starts: "2027-02-22", ends: "2027-06-11" },
  },
  schools: [
    { slug: "computing", name: "School of Computing", programs: [{ slug: "bsc-cyber-security", name: "Cyber Security", degree: "B.Sc." }] },
    { slug: "medicine", name: "School of Medicine", programs: [{ slug: "md-doctor-of-medicine", name: "Doctor of Medicine", degree: "M.D." }] },
  ],
  curricula: {
    "bsc-cyber-security": {
      program: "bsc-cyber-security", source_url: "https://newuu.uz/x", academic_year: null,
      semesters: [
        { number: 1, year: 1, term: "fall", courses: [{ code: "MATH111", subject: "Calculus 1", credits: 6, type: "core", elective_group: null, prerequisites: null }] },
        { number: 2, year: 1, term: "spring", courses: [{ code: "MATH211", subject: "Calculus 2", credits: 6, type: "core", elective_group: null, prerequisites: null }, { code: "PHYS101", subject: "Physics 1", credits: 8, type: "elective", elective_group: null, prerequisites: null }] },
      ],
    },
    "md-doctor-of-medicine": { program: "md-doctor-of-medicine", source_url: "https://newuu.uz/md", academic_year: null, semesters: [] },
  },
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
