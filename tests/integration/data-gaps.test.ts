import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lms = vi.hoisted(() => ({
  employee: vi.fn(), semesterCalendar: vi.fn(), semesterList: vi.fn(), lesson: vi.fn(), downloadFile: vi.fn(),
  notifications: vi.fn(), gradebookSemesters: vi.fn(), gradebookData: vi.fn(), homework: vi.fn(), scheduleList: vi.fn(),
}));
const store = vi.hoisted(() => ({ sessionFor: vi.fn() }));
const storage = vi.hoisted(() => ({ putObject: vi.fn() }));
const tg = vi.hoisted(() => ({ send: vi.fn() }));
const nextCache = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/lms/client", async (orig) => ({ ...(await orig<object>()), ...lms }));
vi.mock("@/lib/lms/store", async (orig) => ({ ...(await orig<object>()), ...store }));
vi.mock("@/lib/storage", async (orig) => ({ ...(await orig<object>()), ...storage }));
vi.mock("@/lib/telegram/api", async (orig) => ({ ...(await orig<object>()), ...tg }));
vi.mock("next/cache", async (orig) => ({ ...(await orig<object>()), ...nextCache }));
vi.mock("@/server/sync/refresh", () => ({ scheduleRefresh: vi.fn(), refreshOnce: vi.fn(), refreshStudent: vi.fn() }));
vi.mock("@/lib/lms/cache", async (orig) => ({ ...(await orig<object>()), preloadUser: vi.fn().mockResolvedValue(null) }));

import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db } from "@/lib/db";
import { faces, feedItems, lmsCache, lmsCourses, lmsFiles, lmsSemesters, lmsTeachers, searchEvents } from "@/lib/db/schema";
import { harvestCourseFiles } from "@/lib/lms/files";
import { harvestTeacherDetails, teacherProfile } from "@/lib/lms/harvest";
import { semesterGpas } from "@/lib/lms/profile";
import { harvestSemesters, parseCalendar, refreshCalendars } from "@/lib/lms/semesters";
import { ingest } from "@/server/feed";
import { saveRating } from "@/server/ratings";
import { hide, publish, submitUpload } from "@/server/uploads";
import { runReminders } from "@/server/sync/reminders";
import { syncStudent } from "@/server/sync/student";
import * as views from "@/server/views";
import { resetDb } from "../fixtures/db";
import { NOW, cache, seedStudent, unix } from "../fixtures/student";

const session = { token: "t" };
let userId: string;

beforeEach(async () => {
  await resetDb();
  for (const f of [...Object.values(lms), store.sessionFor, storage.putObject, tg.send, nextCache.revalidateTag]) f.mockReset();
  store.sessionFor.mockResolvedValue(session);
  storage.putObject.mockImplementation(async (key: string) => key);
  tg.send.mockResolvedValue({ message_id: 1 });
  userId = await seedStudent();
});
afterEach(() => vi.clearAllMocks());

const tags = () => nextCache.revalidateTag.mock.calls.map((c) => c[0] as string);

describe("1. professor background from the LMS staff profile", () => {
  const detail = {
    employee_id: "T1",
    academicStatus: { name: "Senior Lecturer" },
    departmentTree: [{ name: "School of Humanities and Sciences" }, { name: "Department of Mathematics" }],
    education: [
      { degree: "PhD", specialty: "Applied Mathematics", university_name: "University of Porto", end_year: "2014" },
      { academic_degree: { name: "MSc" }, institution: "IST Lisbon", date_end: "2009-07-01" },
    ],
    publications: [{ title: "Stochastic models of growth", journal: "J. Appl. Prob.", year: 2019, url: "https://doi.org/x" }, { name: "" }],
    science_direction: "<p>Probability</p>",
    imagesUrls: ["https://lms/photo.jpg"],
  };

  it("parses education, publications and department, never the photo", () => {
    const p = teacherProfile(detail);
    expect(p).toEqual({
      position: "Senior Lecturer",
      department: "Department of Mathematics",
      education: [
        { degree: "PhD", field: "Applied Mathematics", institution: "University of Porto", year: "2014" },
        { degree: "MSc", field: null, institution: "IST Lisbon", year: "2009" },
      ],
      publications: [{ title: "Stochastic models of growth", year: "2019", venue: "J. Appl. Prob.", url: "https://doi.org/x" }],
      scienceDirection: "Probability",
    });
    expect(JSON.stringify(p)).not.toContain("photo");
    // A plain-text list works too.
    expect(teacherProfile({ education: "PhD, Porto 2014<br>MSc, Lisbon 2009" }).education.map((e) => e.year)).toEqual(["2014", "2009"]);
  });

  it("stores the profile and returns it with years at NewUU from the first semester taught", async () => {
    lms.employee.mockImplementation(async (_s, id: string) => (id === "T1" ? detail : null));
    await harvestTeacherDetails(session);
    const [row] = await db().select().from(lmsTeachers).where(eq(lmsTeachers.id, "T1"));
    expect(JSON.stringify(row)).not.toContain("photo");
    // T1 taught semester 6 (Fall 2023 here) and 8.
    await db().insert(lmsSemesters).values([{ id: "6", name: "2023-2024 Fall semester" }, { id: "8", name: "Fall 2026", starts: "2026-09-14" }]);
    await db().insert(faces).values({ teacherId: "T1", storageKey: "faces/t1.png" });
    const p = (await views.professor("T1", null, NOW))!;
    expect(p).toMatchObject({
      position: "Senior Lecturer", department: "Department of Mathematics", research: "Probability", since: "Fall 2023", years: 3, face: expect.stringMatching(/^\/faces\/T1\?v=[a-z0-9]+$/),
      education: [expect.objectContaining({ degree: "PhD" }), expect.objectContaining({ degree: "MSc" })],
      publications: [expect.objectContaining({ title: "Stochastic models of growth" })],
    });
    const list = await views.professors(null);
    expect(list.all.find((r) => r.id === "T1")).toMatchObject({ department: "Department of Mathematics", face: expect.stringMatching(/^\/faces\/T1\?v=[a-z0-9]+$/) });
    expect(list.all.find((r) => r.id === "T2")?.face).toBeNull();
  });

  it("leaves background null when the LMS has none", async () => {
    const p = (await views.professor("T2", null, NOW))!;
    expect(p).toMatchObject({ education: null, publications: null, years: null, since: null });
  });
});

describe("2. LMS announcement author and course", () => {
  it("stores author and course in the feed and shows them in notifications and today", async () => {
    lms.notifications.mockResolvedValue({ all: [{ id: 77, title: "Quiz 6 opens", body: "x", author: "PINTO GONÇALO", subject: { name: "Calculus 1" }, publicate_at: unix("2026-11-02T08:00:00+05:00"), read: 0 }] });
    lms.gradebookSemesters.mockResolvedValue([]);
    lms.homework.mockResolvedValue([]);
    lms.scheduleList.mockResolvedValue([]);
    await syncStudent(userId, NOW);
    const [row] = await db().select().from(feedItems).where(eq(feedItems.id, "lms:77"));
    expect(row).toMatchObject({ author: "Pinto Gonçalo", courseName: "Calculus 1" });
    const n = (await views.notifications(userId, {}, NOW))!;
    expect(n.sections[0].items[0]).toMatchObject({ author: "Pinto Gonçalo", courseName: "Calculus 1", byline: "LMS · Calculus 1 · Pinto Gonçalo" });
    const t = (await views.today(userId, NOW))!;
    expect(t.notifications.items[0].byline).toBe("LMS · Calculus 1 · Pinto Gonçalo");
    // The bot card carries them too.
    expect((tg.send.mock.calls[0][1] as { text: string }).text).toContain("Calculus 1 · Pinto Gonçalo");
  });

  it("fills author on an item stored before, without announcing it again", async () => {
    await ingest(userId, [{ id: "lms:9", kind: "announcement", title: "Old", at: NOW, read: false }]);
    const fresh = await ingest(userId, [{ id: "lms:9", kind: "announcement", title: "Old", author: "Ann Lee", at: NOW, read: false }]);
    expect(fresh).toEqual([]);
    const [row] = await db().select().from(feedItems).where(eq(feedItems.id, "lms:9"));
    expect(row.author).toBe("Ann Lee");
  });
});

describe("3. file date and page count", () => {
  it("keeps the LMS upload date and counts PDF pages when downloading", async () => {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < 3; i++) pdf.addPage();
    lms.downloadFile.mockResolvedValue({ bytes: Buffer.from(await pdf.save()), contentType: "application/octet-stream" });
    lms.lesson.mockResolvedValue({ lessonMaterials: [{ id: "M1", name: "Week 3_Limits.pdf", file_extension: "pdf", file_version: "1", created_at: "2026-09-28 09:00:00", updated_at: "2026-09-29 10:00:00", fileFullUrl: "/v1/f" }] });
    await harvestCourseFiles(session, "101");
    const [row] = await db().select().from(lmsFiles).where(eq(lmsFiles.id, "M1"));
    expect(row.pages).toBe(3);
    expect(row.lmsCreatedAt?.toISOString()).toBe("2026-09-28T04:00:00.000Z");
    const items = (await views.course("MATH111", null, { userId }, NOW))!.files!.items;
    expect(items.find((f) => f.id === "M1")).toMatchObject({ date: "2026-09-28T04:00:00.000Z", dateLabel: "28 Sep", pages: 3 });
    expect(await views.file("M1", { userId })).toMatchObject({ pages: 3, date: "2026-09-28T04:00:00.000Z", teacher: { id: "T1", name: "Gonçalo Pinto" } });
  });

  it("gives non-PDF files no page count", async () => {
    lms.downloadFile.mockResolvedValue({ bytes: Buffer.from("PK zip"), contentType: "application/zip" });
    lms.lesson.mockResolvedValue({ lessonMaterials: [{ id: "M2", name: "Slides.pptx", file_extension: "pptx", file_version: "1", fileFullUrl: "/v1/f" }] });
    await harvestCourseFiles(session, "101");
    const [row] = await db().select().from(lmsFiles).where(eq(lmsFiles.id, "M2"));
    expect(row.pages).toBeNull();
  });
});

describe("4. semester calendar phases", () => {
  const calendar = [
    { name: "Cohorts selection", begin_date: "2026-11-04", end_date: "2026-11-08" },
    { name: "Schedule builder", begin_date: "09.11.2026", end_date: "12.11.2026" },
    { name: "AddDrop", begin_date: "2026-10-20 00:00:00", end_date: "2026-11-03 23:59:00" },
    { name: "Studies", begin_date: "2027-01-25", end_date: "2027-05-15" },
  ];

  it("parses the phases leniently", () => {
    expect(parseCalendar({ data: calendar }).map((p) => p.kind)).toEqual(["add-drop", "cohort-selection", "schedule-builder", "studies"]);
    expect(parseCalendar([{ title: "x" }])).toEqual([]);
  });

  it("fetches each semester once a day for everyone and feeds next semester, calendar and the bot", async () => {
    lms.semesterCalendar.mockResolvedValue(calendar);
    await db().insert(lmsSemesters).values({ id: "9", name: "Spring 2027" });
    expect(await refreshCalendars(session, ["9"], NOW)).toBe(1);
    expect(await refreshCalendars(session, ["9"], new Date(NOW.getTime() + 3600_000))).toBe(0);
    expect(lms.semesterCalendar).toHaveBeenCalledTimes(1);

    const next = (await views.nextSemester(userId, NOW))!;
    expect(next.phases.map((p) => [p.title, p.starts, p.ends])).toEqual([
      ["Add/drop", "2026-10-20", "2026-11-03"], ["Cohort selection", "2026-11-04", "2026-11-08"], ["Schedule builder", "2026-11-09", "2026-11-12"], ["Classes start", "2027-01-25", "2027-01-25"],
    ]);
    const cal = await views.calendar({ userId }, ["registration"], NOW);
    expect(cal.days.flatMap((d) => d.events).map((e) => e.title)).toEqual(expect.arrayContaining(["Cohort selection", "Schedule builder", "Add/drop"]));

    await runReminders(userId, NOW);
    const texts = tg.send.mock.calls.map((c) => (c[1] as { text: string }).text);
    expect(texts.some((t) => t.includes("Cohort selection opens on Wednesday 4 Nov"))).toBe(true);
    expect(texts.some((t) => t.includes("Add/drop closes tomorrow 23:59") && t.includes("Spring 2027"))).toBe(true);
    // Once only.
    tg.send.mockClear();
    await runReminders(userId, new Date(NOW.getTime() + 10 * 60_000));
    expect(tg.send.mock.calls.map((c) => (c[1] as { text: string }).text).filter((t) => /Cohort|Add\/drop/.test(t))).toEqual([]);
  });

  it("the student sync fetches the open semester's calendar", async () => {
    lms.notifications.mockResolvedValue({});
    lms.gradebookSemesters.mockResolvedValue([{ id: 1, semester_id: 8, semester_name: "Fall 2026", is_open: 1, study_start: "2026-09-14" }]);
    lms.gradebookData.mockResolvedValue({ resultSubjects: {} });
    lms.homework.mockResolvedValue([]);
    lms.scheduleList.mockResolvedValue([]);
    lms.semesterCalendar.mockResolvedValue(calendar);
    await syncStudent(userId, NOW);
    expect(lms.semesterCalendar).toHaveBeenCalledWith(session, "8");
    const [row] = await db().select().from(lmsSemesters).where(eq(lmsSemesters.id, "8"));
    expect(row).toMatchObject({ name: "Fall 2026", starts: "2026-09-14" });
    expect(row.calendar).toHaveLength(4);
  });
});

describe("5. semester names for course terms", () => {
  it("names every term from the harvested semester list", async () => {
    lms.semesterList.mockResolvedValue({ data: [{ id: "6", name: "Fall 2025" }, { id: "8", name: "Fall 2026" }] });
    lms.semesterCalendar.mockResolvedValue([]);
    await db().update(lmsCache).set({ data: cache }).where(eq(lmsCache.userId, userId));
    // No student has synced the old semester's name.
    await db().update(lmsCourses).set({ semesterId: "6" }).where(eq(lmsCourses.id, "90"));
    expect(await harvestSemesters(session, NOW)).toMatchObject({ semesters: 2 });
    const c = (await views.course("MATH111", null, null, NOW))!;
    expect(c.terms.map((t) => t.term)).toEqual(["Fall 2026", "Fall 2025"]);
    expect(c.terms.some((t) => /^Semester /.test(t.term))).toBe(false);
  });
});

describe("6. cache invalidation from the writers", () => {
  it("a saved rating refreshes the course and its teachers", async () => {
    await saveRating(userId, { id: "90" }, "Fall 2025", { recommend: "yes", hours: null, difficulty: null, tags: [], teachers: [{ teacherId: "T1", role: "lecture", pressF: true, tags: [] }] });
    expect(tags()).toEqual(expect.arrayContaining(["ratings", "course:MATH111", "teacher:T1"]));
  });

  it("returns the saved answers so Edit your rating opens prefilled", async () => {
    const answers = { recommend: "unsure" as const, hours: null, difficulty: 4 as const, tags: [], teachers: [{ teacherId: "T1", role: "lecture" as const, pressF: true, tags: [] }] };
    await saveRating(userId, { id: "90", code: "MATH111" }, "Fall 2025", answers);
    const q = (await views.rateQueue(userId, NOW))!;
    expect(q.rated[0].answers).toEqual(answers);
    const c = (await views.course("MATH111", "6", { userId }, NOW))!;
    expect(c.rate).toMatchObject({ rated: true, answers });
  });

  it("uploads going live, hidden, or arriving live refresh the course files", async () => {
    const base = { uploaderId: userId, courseId: "101", courseCode: "MATH111", title: "Mock", type: "mock", fileName: "m.pdf", mimeType: "application/pdf", size: 1 };
    const waiting = await submitUpload({ ...base, sha256: "a" }, 0.99);
    expect(tags()).toEqual([]);
    const id = (waiting as { upload: { id: string } }).upload.id;
    await publish(id, userId);
    expect(tags()).toEqual(expect.arrayContaining(["files:MATH111", "course:MATH111"]));
    nextCache.revalidateTag.mockClear();
    await hide(id, userId);
    expect(tags()).toContain("files:MATH111");
  });
});

describe("7. per-semester GPA", () => {
  it("reads semester GPAs only when the transcript lists them", () => {
    expect(semesterGpas({ gpa: "3.4" })).toEqual({});
    expect(semesterGpas({ transcript: { semesters: [{ semester_id: 6, semester_name: "Fall 2025", gpa: "3.71" }] } })).toEqual({ "6": 3.71, "Fall 2025": 3.71 });
  });

  it("returns them in progress, null otherwise", async () => {
    expect((await views.progress(userId, NOW))!.earlier).toEqual([expect.objectContaining({ term: "Fall 2025", gpa: null })]);
    await db().update(lmsCache).set({ data: { ...cache, profile: { ...cache.profile!, semesterGpa: { "Fall 2025": 3.71 } } } }).where(eq(lmsCache.userId, userId));
    expect((await views.progress(userId, NOW))!.earlier).toEqual([expect.objectContaining({ term: "Fall 2025", gpa: 3.71 })]);
  });
});

describe("guest home, faces, attendance, desktop extras", () => {
  it("lists popular courses and fresh files for guests without file access", async () => {
    await db().insert(searchEvents).values([{ kind: "Course", targetId: "PHYS101" }, { kind: "Course", targetId: "PHYS101" }, { kind: "Course", targetId: "MATH111" }]);
    await db().insert(faces).values({ teacherId: "T1", storageKey: "faces/t1.png" });
    const g = await views.guestHome();
    expect(g.guest).toBe(true);
    expect(g.popular.map((c) => c.code)).toEqual(["PHYS101", "MATH111"]);
    expect(g.popular[1].teacher).toEqual({ id: "T1", name: "Gonçalo Pinto", face: expect.stringMatching(/^\/faces\/T1\?v=[a-z0-9]+$/) });
    expect(g.freshFiles[0]).toMatchObject({ id: "F1", title: "Midterm review slides", course: "Calculus 1", source: { kind: "lms" }, href: "/f/F1" });
    expect(JSON.stringify(g.freshFiles)).not.toMatch(/storage|url/i);
  });

  it("puts faces on course cards and teacher entries", async () => {
    await db().insert(faces).values({ teacherId: "T1", storageKey: "faces/t1.png" });
    const t = (await views.today(userId, NOW))!;
    expect(t.courses.find((c) => c.code === "MATH111")?.teacher).toEqual({ id: "T1", name: "Gonçalo Pinto", face: expect.stringMatching(/^\/faces\/T1\?v=[a-z0-9]+$/) });
    expect(t.courses.find((c) => c.code === "PHYS101")?.teacher?.face).toBeNull();
    const c = (await views.course("MATH111", null, { userId }, NOW))!;
    expect(c.teachers[0].face).toMatch(/^\/faces\/T1\?v=/);
    expect(c.myCourses?.map((x) => x.code)).toEqual(["MATH111", "PHYS101"]);
    expect((await views.course("MATH111", null, null, NOW))!.myCourses).toBeNull();
  });

  it("returns a course's attendance from the snapshot by id, code or name", async () => {
    lms.notifications.mockRejectedValue(new Error("must not call the LMS"));
    expect(await views.courseAttendance(userId, "101")).toMatchObject({ courseId: "101", code: "MATH111", absences: { left: 6, missed: 9 } });
    expect((await views.courseAttendance(userId, "phys101"))?.absences?.left).toBe(2);
    expect((await views.courseAttendance(userId, "Calculus 1"))?.courseId).toBe("101");
    expect(await views.courseAttendance(userId, "Nope")).toBeNull();
    expect(lms.notifications).not.toHaveBeenCalled();
  });

  it("gives the timetable the whole week and the file its same-week files", async () => {
    const tt = (await views.timetable(userId, "2026-11-02", NOW))!;
    expect(tt.weekClasses?.map((c) => c.code)).toEqual(expect.arrayContaining(["MATH111", "PHYS101"]));
    expect(tt.classes.every((c) => c.start.startsWith("2026-11-02"))).toBe(true);
    await db().insert(lmsFiles).values({ id: "F2", courseId: "101", code: "MATH111", lessonId: "L15", name: "Week 8_Problem set.pdf", extension: "pdf", storageKey: "k" });
    const f = await views.file("F1", { userId });
    expect(f).toMatchObject({ week: 8, sameWeek: [expect.objectContaining({ id: "F2" })] });
    expect(await views.file("F1", null)).toEqual({ locked: true, id: "F1", course: { code: "MATH111", name: "Calculus 1" } });
  });
});

