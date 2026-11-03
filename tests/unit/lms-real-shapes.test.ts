import { describe, expect, it } from "vitest";
import { attendance, attendanceEvents } from "@/core/attendance";
import { deadline } from "@/core/deadlines";
import { cleanTitle } from "@/core/files";
import { fromLms } from "@/core/notifications";
import { displayName, personOf, roleOf } from "@/core/people";
import { withLang } from "@/lib/lms/client";
import { courseRoles } from "@/lib/lms/harvest";
import type { LmsGradebookData, LmsGradebookSemester, LmsHomework, LmsMyList, LmsScheduleDay, LmsSubject } from "@/lib/lms/types";
import { gradeAlerts, gradebookCourses, historyAlerts, lmsNotifications, scheduleClasses, studiedSemesters } from "@/server/sync/convert";
import { normalizeSnapshot, outdated, termName, type SyncedCourse } from "@/server/sync/types";
import * as real from "../fixtures/lms-real";

const NOW = new Date("2026-11-03T08:00:00Z");
const named = (id: string) => ({ name: id === "906" ? "Neural Networks" : "Course", code: "CS412" });

describe("real LMS shapes: gradebook", () => {
  const [nn, grad] = gradebookCourses(real.gradebookOpen as unknown as LmsGradebookData, "181", true).sort((a, b) => b.subjectId.localeCompare(a.subjectId));

  it("reads the per-period mark lists and the component marks", () => {
    expect(nn).toMatchObject({ subjectId: "906", name: "Neural Networks", average: 100, rating: 33, midterm: 42, admission: 33, siw: 0, admitted: true });
  });

  it("treats a running semester's 0 final as not in yet", () => {
    expect(nn).toMatchObject({ final: null, passed: null, exam: 0 });
  });

  it("keeps a closed semester's finals, a failed 0 included", () => {
    const closed = gradebookCourses(real.gradebookClosed as unknown as LmsGradebookData, "179", false);
    expect(closed.map((c) => [c.subjectId, c.final, c.passed, c.exam])).toEqual([["718", 0, false, 0], ["742", 57, true, 36]]);
    expect(closed[1].teachers).toEqual(["Dilnoza Yusupova", "Aziza Karimova"]);
  });

  it("reads the first-year gradebook's older shapes", () => {
    const first = gradebookCourses(real.gradebookFirstYear as unknown as LmsGradebookData, "10", false);
    // A final of 45 passes (minimal_final is 40) though the LMS's positive_status is false under 50.
    expect(first.map((c) => [c.name, c.final, c.passed, c.average, c.exam])).toEqual([["Digital Literacy", 80, true, null, null], ["Calculus I", 45, true, null, null]]);
  });

  it("only a final under 40 is a retake; old snapshots that stored positive_status are corrected", () => {
    const course = (final: number | null, passed: boolean | null) => ({ subjectId: "x", semesterId: "11", name: "C", final, passed, fx: false } as unknown as SyncedCourse);
    const sync = normalizeSnapshot({ semesters: [], courses: [course(45, false), course(40, false), course(39, false), course(0, false)] });
    expect(sync.courses.map((c) => c.passed)).toEqual([true, true, false, false]);
    expect(gradebookCourses({ resultSubjects: [] }, "182", true)).toEqual([]);
  });

  it("has no absence limit for a course without classes", () => {
    expect(attendance(grad.admit)).toBeNull();
    expect(attendance(nn.admit)).toMatchObject({ missed: 8, left: 7, limit: 15 });
  });

  it("dates classes by when they took place and tells present, late, absent, excused and QR apart", () => {
    const events = attendanceEvents(nn.events);
    expect(events.map((e) => [e.lesson, e.mark, e.viaQr, e.kind])).toEqual([
      ["Lecture № 1", "present", true, "lecture"],
      ["Lecture № 2", "late", true, "lecture"],
      ["Lab № 1", "absent", false, "lab"],
      ["Lab № 2", "excused", false, "lab"],
      ["Tutorial № 1", "present", false, "practice"],
      ["Lecture № 15", "unmarked", false, "lecture"],
    ]);
    // The class start (schedule[0].begin_time), not the marking time.
    expect(events[0].at?.toISOString()).toBe(new Date(1789898400 * 1000).toISOString());
    expect(nn.events[0]).not.toHaveProperty("schedule");
  });
});

describe("real LMS shapes: semesters and names", () => {
  it("adds the first study year from my-list, leaves out the upcoming one, oldest first", () => {
    const rows = studiedSemesters(real.gradebookSemesters as unknown as LmsGradebookSemester[], real.myList as unknown as LmsMyList);
    expect(rows.map((s) => [s.id, s.term, s.open])).toEqual([
      ["10", "Fall 2023", false], ["11", "Spring 2024", false], ["13", "Fall 2024", false], ["14", "Spring 2025", false],
      ["178", "Fall 2025", false], ["179", "Spring 2026", false], ["180", "Summer 2026", false], ["181", "Fall 2026", true],
    ]);
  });

  it("names Russian and Uzbek semesters in English", () => {
    expect(termName("Весенний (2026-2027)")).toBe("Spring 2027");
    expect(termName("Осенний (2023-2024)")).toBe("Fall 2023");
    expect(termName("Летний (2025-2026)")).toBe("Summer 2026");
    expect(termName("Kuzgi (2024-2025)")).toBe("Fall 2024");
  });

  it("asks the LMS for English on every read", () => {
    expect(withLang("/subject/my-list")).toBe("/subject/my-list?lang=en");
    expect(withLang("/gradebook/gradebook-data?semester_id=10")).toBe("/gradebook/gradebook-data?semester_id=10&lang=en");
    expect(withLang("/x?lang=ru")).toBe("/x?lang=ru");
  });

  it("shows teachers as given name + family name", () => {
    const [lecturer] = real.myList.semesters[3].subjects[0].subject.employee;
    expect(personOf(lecturer)).toBe("Aziza Karimova");
    expect(displayName({ first_name_en: "", last_name_en: "", sur_name_en: "" })).toBe("Teacher");
    expect(personOf({ first_name_en: "", first_name_ru: "Тимур", sur_name_en: "Rashidov" })).toBe("Тимур Rashidov");
  });

  it("takes teaching roles from the lessons, and the LMS role names and ids", () => {
    expect(courseRoles(real.subjectById as unknown as LmsSubject)).toEqual([
      { teacherId: "141", role: "Lecture" },
      { teacherId: "215", role: "Laboratory" },
      { teacherId: "214", role: null },
    ]);
    expect(["Lecture", "Tutorial", "Laboratory", "Other.", "1", 2].map(roleOf)).toEqual(["lecture", "tutorial", "lab", "other", "tutorial", "lab"]);
  });
});

describe("real LMS shapes: notifications, schedule, homework, files", () => {
  it("reads every notification tab, polls included", () => {
    const notes = lmsNotifications(real.notifications);
    expect(notes.map((n) => n.id).sort()).toEqual([90500, 90617, 90700]);
  });

  it("drops the LMS's placeholder author", () => {
    const [n] = real.notifications.advertise;
    expect(fromLms(n).author).toBeUndefined();
    expect(fromLms(real.notifications.polls_event[0]).author).toBe("Dilnoza Yusupova");
  });

  it("reads the room number and the lesson kind from the schedule", () => {
    const [c] = scheduleClasses(real.scheduleDays as unknown as LmsScheduleDay[], []);
    expect(c).toMatchObject({ subjectId: "906", room: "MATH 306", kind: "lecture", teacherId: "141", lessonId: "52681" });
  });

  it("reads Russian homework statuses and the working id", () => {
    const d = deadline(real.homework.data[0] as LmsHomework)!;
    expect(d).toMatchObject({ id: "26651", course: "Neural Networks", title: "HW3", status: "todo" });
  });

  it("strips the course name and code variants from file titles", () => {
    expect(cleanTitle("Neural Networks - Midterm Review Problem Solving 1.pdf", { courseName: "Neural Networks", courseCode: "CS412" })).toBe("Midterm Review Problem Solving 1");
    expect(cleanTitle("CS 412 Syllabus.pdf", { courseName: "Neural Networks", courseCode: "CS412" })).toBe("Syllabus");
    expect(cleanTitle("Midterm guideline_NeuralNetworks.docx", { courseName: "Neural Networks", courseCode: "CS412" })).toBe("Midterm guideline");
    expect(cleanTitle("Neural Networks.pdf", { courseName: "Neural Networks" })).toBe("Neural Networks");
  });
});

describe("old snapshots and alerts", () => {
  const old = (over: Partial<SyncedCourse>): SyncedCourse => ({ subjectId: "906", semesterId: "181", name: "Neural Networks", average: null, rating: null, final: 0, passed: false, fx: false, admit: null, events: [], ...over });

  it("re-reads a v1 snapshot: the open semester's 0 final is no final, and it asks for a re-sync", () => {
    const sync = normalizeSnapshot({ at: "2026-11-02T00:00:00Z", semesters: [{ id: "181", term: "Fall 2026", year: 4, open: true, starts: null, ends: null }, { id: "179", term: "Spring 2026", year: 3, open: false, starts: null, ends: null }], courses: [old({}), old({ semesterId: "179", subjectId: "718" })] });
    expect(sync.courses.map((c) => [c.subjectId, c.final])).toEqual([["906", null], ["718", 0]]);
    expect(sync.homework).toEqual([]);
    expect(outdated(sync)).toBe(true);
    expect(outdated(normalizeSnapshot({ ...sync, v: 2 }))).toBe(false);
  });

  it("never announces the grades of a course seen for the first time", () => {
    const courses = gradebookCourses(real.gradebookFirstYear as unknown as LmsGradebookData, "10", false);
    expect(gradeAlerts({}, courses, NOW, named, new Set())).toEqual([]);
    expect(gradeAlerts({}, courses, NOW, named, new Set(["10|15"]))).toHaveLength(1);
  });

  it("files a course's earlier absences and grades as read history", () => {
    const nn = gradebookCourses(real.gradebookOpen as unknown as LmsGradebookData, "181", true).find((c) => c.subjectId === "906")!;
    const items = historyAlerts([nn], NOW, named).map((a) => a.item);
    expect(items.map((i) => [i.kind, i.title, i.read])).toEqual([
      ["absence", "Marked absent", true],
      ["grade", "Grade: 8 for the tutorial № 1", true],
    ]);
    expect(items[0].at.toISOString()).toBe(new Date(1790589600 * 1000).toISOString());
  });
});
