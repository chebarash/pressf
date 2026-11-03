import { db } from "@/lib/db";
import { lmsAccounts, lmsCache, lmsCourseTeachers, lmsCourses, lmsFiles, lmsTeachers, uploads, userState, users } from "@/lib/db/schema";
import type { UserCache } from "@/lib/lms/cache";
import { SNAPSHOT_KEY, emptySnapshot, type SyncSnapshot } from "@/server/sync/types";

/**
 * One student with a realistic LMS picture for view and sync tests:
 * Monday 2 Nov 2026, 10:30 in Tashkent, Calculus 1 running in B-204.
 */
export const NOW = new Date("2026-11-02T05:30:00Z");
export const unix = (iso: string) => String(Math.floor(Date.parse(iso) / 1000));

export const lesson = (id: string, name: string, type: string, start: string, end: string, room: string, teacher: string) => ({
  id, name, lessonType: { name: type }, schedule: [{ begin_time: unix(start), end_time: unix(end), auditorium: room, employee: { employee_id: teacher, employee_type: type } }],
});

export const courses = [
  { id: "101", code: "MATH111", name: "Calculus 1", credits: 6, semesterId: "8", raw: { lessons: [lesson("L15", "Lecture 15", "Lecture", "2026-11-02T10:00:00+05:00", "2026-11-02T11:20:00+05:00", "B-204", "T1")] } },
  { id: "90", code: "MATH111", name: "Calculus 1", credits: 6, semesterId: "6", raw: { lessons: [] } },
  { id: "102", code: "PHYS101", name: "Physics 1", credits: 6, semesterId: "8", raw: { lessons: [lesson("P14", "Practice 14", "Practice", "2026-11-03T13:00:00+05:00", "2026-11-03T14:20:00+05:00", "A-108", "T2")] } },
];

export const cache: UserCache = {
  enrollment: { semesterName: "Fall 2026", codes: ["MATH111", "PHYS101"], courses: [{ code: "MATH111", subject: "Calculus 1" }, { code: "PHYS101", subject: "Physics 1" }] },
  timetable: [
    { class: "", day: 0, starts: "10:00", ends: "11:20", subject: "Calculus 1", code: "MATH111", teacher: "T1", teacher_name: null, room: "B-204" },
    { class: "", day: 2, starts: "10:00", ends: "11:20", subject: "Calculus 1", code: "MATH111", teacher: "T1", teacher_name: null, room: "B-204" },
    { class: "", day: 1, starts: "13:00", ends: "14:20", subject: "Physics 1", code: "PHYS101", teacher: "T2", teacher_name: null, room: "A-108" },
  ],
  profile: { name: "Shamsiddin Abdurakhimov", email: "s@newuu.uz", gpa: 3.62, ectsEarned: 168, ectsTotal: 240, honors: false, semesters: [] },
};

export const snapshot = (over: Partial<SyncSnapshot> = {}): SyncSnapshot => ({
  ...emptySnapshot(),
  at: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
  tried: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
  semesters: [
    { id: "8", term: "Fall 2026", year: 4, open: true, starts: "2026-09-14", ends: "2027-01-20" },
    { id: "6", term: "Fall 2025", year: 3, open: false, starts: "2025-09-15", ends: "2026-01-20" },
  ],
  courses: [
    { subjectId: "101", semesterId: "8", name: "Calculus 1", average: 74, rating: 51, final: null, passed: null, fx: false, admit: { absence_count_all: 9, avaibale_count_all: 6, lessons_count: 60 }, events: [{ lesson_name: "Lecture 14", lesson_type: 0, status: 3, time: unix("2026-10-26T10:00:00+05:00") }, { lesson_name: "Quiz 5", lesson_type: 1, status: 1, time: unix("2026-10-31T10:00:00+05:00"), mark: 7 }] },
    { subjectId: "102", semesterId: "8", name: "Physics 1", average: 86, rating: 80, final: null, passed: null, fx: false, admit: { absence_count_all: 13, avaibale_count_all: 2, lessons_count: 60 }, events: [] },
    { subjectId: "90", semesterId: "6", name: "Calculus 1", average: 86, rating: 86, final: 86, passed: true, fx: false, admit: null, events: [] },
  ],
  homework: [{ id: 5, subject: "Physics 1", theme_name: "Lab 6 report", time: unix("2026-11-04T23:59:00+05:00"), status_name: "In process" }],
  schedule: [{ subjectId: "101", start: "2026-11-02T05:00:00.000Z", end: "2026-11-02T06:20:00.000Z", room: "B-204", teacherId: "T1", lessonId: "L15", kind: "lecture", was: null }],
  scheduleWindow: { from: "2026-11-01", to: "2026-11-02" },
  ...over,
});

export async function seedStudent(opts: { snapshot?: SyncSnapshot; telegramId?: string | null; email?: string } = {}) {
  const [user] = await db().insert(users).values({ email: opts.email ?? "s@newuu.uz", telegramId: opts.telegramId === undefined ? "111" : opts.telegramId }).returning();
  await db().insert(lmsCourses).values(courses).onConflictDoNothing();
  await db().insert(lmsTeachers).values([{ id: "T1", firstName: "GONÇALO", lastName: "PINTO", position: "Senior lecturer" }, { id: "T2", firstName: "Emily", lastName: "Carter" }]).onConflictDoNothing();
  await db().insert(lmsCourseTeachers).values([{ courseId: "101", teacherId: "T1", role: "Lecture" }, { courseId: "90", teacherId: "T1", role: "Lecture" }, { courseId: "102", teacherId: "T2", role: "Practice" }]).onConflictDoNothing();
  await db().insert(lmsFiles).values({ id: "F1", courseId: "101", code: "MATH111", lessonId: "L15", name: "Week 8_Midterm review slides.pdf", extension: "pdf", storageKey: "lms/101/F1.pdf", size: 1000, fetchedAt: new Date("2026-11-02T03:00:00Z") }).onConflictDoNothing();
  await db().insert(lmsCache).values({ userId: user.id, data: cache, syncedAt: new Date(NOW.getTime() - 10 * 60_000) });
  await db().insert(userState).values({ userId: user.id, snapshot: { [SNAPSHOT_KEY]: opts.snapshot ?? snapshot() } });
  await db().insert(lmsAccounts).values({ userId: user.id, sealedPassword: "v1.x.y.z", status: "active" });
  return user.id;
}

export async function seedUpload(courseCode = "MATH111") {
  const [row] = await db().insert(uploads).values({ courseId: "101", courseCode, title: "Mock midterm with answers", type: "mock", week: 8, status: "live", fileName: "mock.pdf", mimeType: "application/pdf", size: 10, sha256: `sha-${courseCode}`, createdAt: new Date("2026-11-03T00:00:00Z") }).returning();
  return row.id;
}
