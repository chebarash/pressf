import { describe, expect, it } from "vitest";
import { ratingWindow, WEEKS } from "@/core/semester";
import * as adapt from "@/screens/desktop/adapt";
import { rateScreen } from "@/screens/mobile/load";
import { feedMeta } from "@/screens/mobile/parts/FeedRow";
import { rateHrefFor } from "@/server/views/professor";
import type { ClassView, FeedView, FileView, ProfessorView, RateQueueView, TimetableView } from "@/server/views";

const at = (day: string, time = "12:00") => new Date(`${day}T${time}:00+05:00`);

describe("rating window for this semester's courses (Figma 4.2)", () => {
  it("is closed before the last three teaching weeks and says which week it opens in", () => {
    expect(ratingWindow(at("2026-11-03"), WEEKS)).toEqual({ open: false, opensIn: 14 }); // week 8, midterms
    expect(ratingWindow(at("2026-12-08"), WEEKS)).toEqual({ open: false, opensIn: 14 }); // week 13
  });

  it("opens in week 14 and stays open through the break, finals and grading", () => {
    for (const day of ["2026-12-14", "2026-12-23", "2027-01-05", "2027-01-12", "2027-01-20"]) expect(ratingWindow(at(day), WEEKS).open).toBe(true);
  });

  it("closes again when the next semester starts, and is open outside the calendar", () => {
    expect(ratingWindow(at("2027-02-23"), WEEKS)).toEqual({ open: false, opensIn: 14 });
    expect(ratingWindow(at("2030-01-01"), WEEKS)).toEqual({ open: true, opensIn: null });
  });
});

describe("Press F on a professor goes to the viewer's course with them (7.4, D9)", () => {
  const taken = [
    { subjectId: "old", semesterId: "10" },
    { subjectId: "new", semesterId: "12" },
    { subjectId: "other", semesterId: "12" },
  ];
  it("picks the newest course that teacher taught the viewer", () => {
    expect(rateHrefFor(taken, ["old", "new"])).toBe("/rate/new");
  });
  it("skips a semester whose rating window has not opened, and falls back to the queue", () => {
    expect(rateHrefFor(taken, ["old", "new"], new Set(["12"]))).toBe("/rate/old");
    expect(rateHrefFor(taken, ["nope"])).toBe("/rate");
  });
});

const feed = (over: Partial<FeedView>): FeedView => ({
  id: "f1", kind: "announcement", title: "Quiz 6 opens tomorrow at 09:00", body: null, courseId: "c1", courseName: "Calculus 1", author: "Gonçalo Pinto",
  byline: "LMS · Calculus 1 · Gonçalo Pinto", at: "2026-11-02T08:00:00Z", ago: "1 h ago", read: false, needsAck: true, href: null, ...over,
});

describe("notification previews show the LMS byline (2.9, D7)", () => {
  it("mobile rows lead with the byline", () => {
    expect(feedMeta(feed({}))).toBe("LMS · Calculus 1 · Gonçalo Pinto · 1 h ago · needs your OK");
    expect(feedMeta(feed({ kind: "grade", byline: null, author: null, needsAck: false, courseName: "Physics 1", ago: "2 h ago" }))).toBe("Physics 1 · 2 h ago");
  });

  it("desktop names the author in the detail eyebrow, and in the row when there is no course", () => {
    const d = adapt.notifications({ unread: 1, open: null, sections: [{ title: "Today", items: [feed({}), feed({ id: "f2", courseId: null, courseName: null, needsAck: false, ago: "3 h ago", author: "Alisher Ikramov" })] }] } as never);
    expect(d.items[0].meta).toBe("LMS · Calculus 1 · 1 h ago · needs your OK");
    expect(d.items[0].eyebrow).toBe("LMS announcement · Calculus 1 · Gonçalo Pinto · 1 h ago");
    expect(d.items[1].meta).toBe("LMS · Alisher Ikramov · 3 h ago");
  });
});

const item = { courseId: "c1", code: "MATH111", name: "Calculus 1", term: "Spring 2026", href: "/rate/c1", teachers: [{ id: "t1", name: "Gonçalo Pinto", role: "lecture" as const, roleLabel: "Lectures" }] };
const answers = { recommend: "yes" as const, hours: "4-6" as const, difficulty: 4 as const, tags: ["Fair exams" as const], teachers: [{ teacherId: "t1", role: "lecture" as const, pressF: true, tags: ["Explains clearly" as const] }] };
const queue: RateQueueView = {
  currentTerm: "Fall 2026", waiting: [], total: 1, ask: { level: "none", term: null, waiting: [] }, current: [], window: { open: false, opensIn: 14 },
  rated: [{ ...item, recommend: "yes", pressedF: ["Gonçalo Pinto"], updatedAt: "2026-06-01T00:00:00Z", updatedLabel: "1 Jun", canEdit: true, answers }],
};

describe("editing a rating opens on the saved answers (4.12, D5)", () => {
  it("prefills the mobile rate sheet", () => {
    expect(rateScreen(queue, "c1").open?.draft).toEqual(answers);
  });

  it("prefills the desktop dialog, keeping teacher stickers", () => {
    const d = adapt.rate(queue, "c1");
    expect(d.course?.id).toBe("c1");
    expect(d.initial).toEqual({ recommend: "yes", hours: "4-6", difficulty: 4, tags: ["Fair exams"], pressed: ["t1"], teacherTags: { "t1|lecture": ["Explains clearly"] } });
  });

  it("opens this semester's course once the window is open, empty", () => {
    const now = { ...item, courseId: "c9", term: "Fall 2026", href: "/rate/c9" };
    const open = rateScreen({ ...queue, current: [now], window: { open: true, opensIn: null } }, "c9").open;
    expect(open?.item.courseId).toBe("c9");
    expect(open?.draft).toBeNull();
    expect(rateScreen(queue, "c9").open).toBeNull();
  });
});

const cls = (key: string, day: string, time: string, over: Partial<ClassView> = {}): ClassView =>
  ({ key, courseId: key, code: "MATH111", name: "Calculus 1", kind: "lecture", start: at(day, time).toISOString(), end: new Date(at(day, time).getTime() + 80 * 60_000).toISOString(), time, endTime: "11:20", room: "B-204", teacher: null, status: "later", changedFrom: null, lessonIds: [], ...over }) as ClassView;

describe("desktop timetable shows the whole week (D3)", () => {
  const week = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
  const v = {
    sync: {} as TimetableView["sync"], day: "2026-11-02", weekLabel: "Midterm exams", holiday: null, nextClass: null,
    week: week.map((d, i) => ({ day: d, label: ["Mon", "Tue", "Wed", "Thu", "Fri"][i], date: `${2 + i} Nov`, selected: i === 0, today: i === 0, classes: 1 })),
    classes: [{ ...cls("a", "2026-11-02", "10:00"), lesson: "Lecture 15", materials: [], absences: { missed: 9, limit: 15, left: 6 } }],
    weekClasses: [cls("a", "2026-11-02", "10:00"), cls("b", "2026-11-05", "10:00", { kind: "exam", endTime: "12:00" }), cls("c", "2026-11-08", "10:00")],
  } as unknown as TimetableView;

  it("places every weekday class, with the selected day's details", () => {
    const d = adapt.timetable(v, at("2026-11-02", "09:35"));
    expect(d.classes.map((c) => [c.id, c.day])).toEqual([["a", 0], ["b", 3]]);
    expect(d.classes[0].tags).toEqual(["MATH111", "Lecture 15"]);
    expect(d.classes[0].absences?.left).toBe("6 left");
    expect(d.classes[1].title).toBe("Calculus 1 · MIDTERM");
    expect(d.classes[1].meta).toBe("10:00–12:00 · B-204");
    expect(d.days.every((x) => x.loaded)).toBe(true);
    expect(d.selected).toBe("a");
  });
});

describe("file preview context (D12)", () => {
  const f = {
    locked: false, id: "f1", source: "lms", title: "Midterm review slides", course: { code: "MATH111", name: "Calculus 1" }, week: 8, type: "lecture", typeLabel: "Lecture",
    format: "pdf", formatCode: "PDF", from: "LMS", date: "2026-11-02T00:00:00Z", dateLabel: "2 Nov", size: 3_100_000, pages: 24, mimeType: "application/pdf", downloadName: "x.pdf", url: null,
    teacher: { id: "t1", name: "Gonçalo Pinto", face: "/faces/t1" },
    sameWeek: [{ id: "f2", source: "students", title: "Mock midterm", type: "exam", typeLabel: "Exam", format: "pdf", formatCode: "PDF", week: 8, date: "2026-11-03T00:00:00Z", dateLabel: "3 Nov", from: "From students", lessonId: null, size: null, href: "/f/f2" }],
  } as unknown as FileView;

  it("shows the LMS date and page count, the week's files and the lecturer", () => {
    const d = adapt.file(f);
    expect(d.file?.meta).toBe("Week 8 · 2 Nov · LMS · 24 pages · 3.1 MB");
    expect(d.course?.weeks[0].files.map((x) => x.id)).toEqual(["f1", "f2"]);
    expect(d.course?.teachers[0]).toMatchObject({ name: "Gonçalo Pinto", face: "/faces/t1", href: "/p/t1" });
  });
});

describe("professor background and years (D9)", () => {
  it("lists degrees, research and publications, and years at NewUU", () => {
    const v = {
      id: "t1", name: "Gonçalo Pinto", position: "Senior lecturer", face: null, department: "Mathematics", school: "School of Computing", summary: { enough: false, count: 0 },
      courses: [], when: [], anonymous: { count: 0, latest: [] }, signedIn: true, teachesYou: false, rateHref: "/rate/c1", years: 5, since: "Fall 2021",
      education: [{ degree: "PhD", field: "Applied Mathematics", institution: "University of Porto", year: "2014" }], research: "Dynamical systems",
      publications: [{ title: "A note", year: "2019", venue: null, url: null }, { title: "Stability", year: "2022", venue: null, url: null }],
    } as unknown as ProfessorView;
    const d = adapt.professor(v);
    expect(d.stats.at(-1)).toEqual({ value: "5 yrs", label: "at NewUU" });
    expect(d.background).toEqual([
      { title: "PhD in Applied Mathematics", meta: "University of Porto · 2014" },
      { title: "Dynamical systems", meta: "Research area" },
      { title: "2 publications", meta: "Latest: Stability · 2022" },
    ]);
    expect(d.rateHref).toBe("/rate/c1");
  });
});
