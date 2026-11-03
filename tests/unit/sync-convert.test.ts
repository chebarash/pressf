import { describe, expect, it } from "vitest";
import { absenceAlerts, announcementAlerts, deadlineAlerts, fileAlert, gradeAlerts, gradebookCourses, lmsNotifications, marksOf, num, scheduleClasses, semesterRows } from "@/server/sync/convert";
import { termName, type SyncedCourse } from "@/server/sync/types";

const NOW = new Date("2026-11-02T05:30:00Z");
const named = () => ({ name: "Physics 1", code: "PHYS101" });
const course = (over: Partial<SyncedCourse>): SyncedCourse => ({ subjectId: "102", semesterId: "8", name: "Physics 1", average: 86, rating: 80, final: null, passed: null, fx: false, admit: { absence_count_all: 12, avaibale_count_all: 3, lessons_count: 60 }, events: [], ...over });

describe("alerts use the shared bot wording (Figma 9.2, 9.3)", () => {
  it("new grade", () => {
    const [a] = gradeAlerts({}, [course({ events: [{ lesson_name: "Midterm", time: 1793595600, status: 1, mark: 86 }] })], NOW, named);
    expect(a.item).toMatchObject({ kind: "grade", title: "New grade: 86 for the midterm", courseId: "102" });
    expect(a.message.text).toBe("<b>New grade in Physics 1</b>\n🟢 Midterm: 86\nAverage now 86");
  });

  it("marked absent and the 2-left warning", () => {
    const before = course({ events: [] });
    const after = course({ admit: { absence_count_all: 13, avaibale_count_all: 2, lessons_count: 60 }, events: [{ lesson_name: "Practice 14", lesson_type: 1, status: 3, time: 1793595600 }] });
    const alerts = absenceAlerts([before], [after], NOW, named);
    expect(alerts.map((a) => a.message.text)).toEqual([
      "<b>Marked absent in Physics 1</b>\n🔴 Absent · Practice 14 · Mon 2 Nov 10:00\n⚠️ 2 absences left in this course",
      "<b>Careful: 2 absences left in Physics 1</b>\n⚠️ 13 of 15 absences used",
    ]);
    expect(absenceAlerts([], [after], NOW, named)).toEqual([]);
  });

  it("deadline 3 h before", () => {
    const due = new Date("2026-11-02T18:59:00Z");
    const alerts = deadlineAlerts([{ id: "3", course: "Software Project Management", title: "Assignment 3", due, status: "todo", grade: null }], new Date(due.getTime() - 3 * 3600_000 + 60_000), new Date(due.getTime() - 3 * 3600_000 - 60_000));
    expect(alerts.map((a) => [a.item.id, a.message.text])).toEqual([["deadline:3:3", "<b>Due in 3 hours: Assignment 3</b>\nSoftware Project Management · 23:59 · not submitted yet"]]);
  });

  it("new files bundled per course", () => {
    const a = fileAlert({ id: "101", code: "MATH111", name: "Calculus 1" }, [{ id: "1", title: "Midterm review slides", week: 8 }, { id: "2", title: "Mock midterm with answers", week: 8 }], NOW);
    expect(a.message.text).toBe("<b>2 new files in Calculus 1</b>\nWeek 8\n• Midterm review slides\n• Mock midterm with answers");
    // The feed title names the course; the files are listed (three at most) below it.
    expect(a.item.title).toBe("2 new files in Calculus 1");
    expect(a.item.body).toBe("Week 8 · Midterm review slides, Mock midterm with answers");
    const many = fileAlert({ id: "101", code: "CS412", name: "Deep Learning" }, Array.from({ length: 10 }, (_, i) => ({ id: String(i), title: i === 1 ? "Lecture 1" : `Lecture ${i + 1}`, week: null })), NOW);
    expect(many.item.title).toBe("10 new files in Deep Learning");
    expect(many.item.body).toBe("Lecture 1, Lecture 3, Lecture 4 and 6 more");
    expect(many.message.text).toBe("<b>10 new files in Deep Learning</b>\n• Lecture 1\n• Lecture 3\n• Lecture 4\nand 6 more");
  });

  it("LMS announcement keeps its own id for the Read button", () => {
    const [a] = announcementAlerts([{ id: 55, title: "Quiz 6 opens tomorrow at 09:00", author: "Gonçalo Pinto", required: 1, acquainted: 0 }]);
    expect(a.item).toMatchObject({ id: "lms:55", needsAck: true, href: "/notifications?open=lms%3A55" });
    expect(a.message.text).toContain("LMS · Quiz 6 opens tomorrow at 09:00");
    expect(a.message.text).toContain("Gonçalo Pinto asks to confirm you've read it");
  });
});

describe("LMS conversions", () => {
  it("normalizes term names", () => {
    expect(termName("2025-2026 Spring semester")).toBe("Spring 2026");
    expect(termName("Fall 2026")).toBe("Fall 2026");
    expect(termName("2026-2027 Autumn")).toBe("Fall 2026");
    expect(semesterRows([{ id: 1, semester_id: 8, semester_name: "Fall 2026", is_open: 1, year_of_study: 4 }])[0]).toMatchObject({ id: "8", term: "Fall 2026", open: true, year: 4 });
  });

  it("reads gradebook numbers in any shape", () => {
    expect([num(5), num("7.5"), num({ mark: 86 }), num(null), num("")]).toEqual([5, 7.5, 86, null, null]);
    const courses = gradebookCourses({ resultSubjects: { "101": { subject: { name: "Calculus 1" }, final_grade: { mark: null }, ...({ average: { mark: 74 } } as object), events: [{ lesson_name: "Quiz 5", time: 100, status: 1, mark: 7 } as never] } } }, "8");
    expect(courses[0]).toMatchObject({ subjectId: "101", average: 74, final: null, passed: null });
    expect(marksOf(courses)).toEqual({ "101:final": null, "101:ev:100:Quiz 5": 7 });
  });

  it("dedupes LMS notifications across tabs", () => {
    expect(lmsNotifications({ all: [{ id: 1 }], notification: [{ id: 1 }, { id: 2 }] }).map((n) => n.id)).toEqual([1, 2]);
  });

  it("notices a room change", () => {
    const day = (room: string) => [{ events: [{ begin_time: "1793595600", end_time: "1793600400", subject_id: "102", auditorium: { name: room }, lesson_id: 7, subjectType: { name: "Practice" } }] }];
    const first = scheduleClasses(day("B-110"), []);
    expect(first[0]).toMatchObject({ room: "B-110", kind: "practice", was: null, lessonId: "7" });
    expect(scheduleClasses(day("A-108"), first)[0]).toMatchObject({ room: "A-108", was: "B-110" });
  });
});
