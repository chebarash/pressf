import { describe, expect, it } from "vitest";
import { between, classByKey, dayIndex, dayAt, monthLayout, mondayOf, switchView, weekLayout, type Weeks } from "@/screens/shared/schedule/model";
import { scheduleQuery } from "@/screens/shared/schedule/store";
import type { CalendarEvent, ScheduleClass, ScheduleWeek } from "@/server/views";
import { attendanceOf, gradebookEntry, homeworkFor, syllabusTopic } from "@/server/views/lessons";
import { comingUp } from "@/server/views/schedule";

const ev = (e: Partial<CalendarEvent> & Pick<CalendarEvent, "key" | "layer" | "day">): CalendarEvent => ({ title: e.key, sub: "", endDay: e.day, time: null, href: null, ...e });
const at = (day: string, time: string) => new Date(`${day}T${time}:00+05:00`);

const cls = (day: string, time: string, over: Partial<ScheduleClass> = {}): ScheduleClass =>
  ({
    key: `101@${at(day, time).toISOString()}`, courseId: "101", code: "MATH111", name: "Calculus 1", kind: "lecture", start: at(day, time).toISOString(), end: new Date(at(day, time).getTime() + 80 * 60_000).toISOString(),
    time, endTime: "11:20", room: "B-204", teacher: null, status: "later", changedFrom: null, lessonIds: [], day, from: Number(time.slice(0, 2)) * 60, to: Number(time.slice(0, 2)) * 60 + 80, tone: 0,
    lesson: { lessonId: null, title: null, description: null, syllabus: null, type: "Lecture", attendance: { mark: "upcoming", label: "Not marked yet", viaQr: false }, grade: null, files: [], homework: [], absences: null, lmsHref: null },
    ...over,
  }) as ScheduleClass;

/** Two loaded weeks, 2–8 and 9–15 Nov 2026; the exam week crosses into the second. */
function weeks(): Weeks {
  const week = (monday: string, events: CalendarEvent[], classes: ScheduleClass[]): ScheduleWeek => ({
    monday, label: null, note: null, events,
    days: Array.from({ length: 7 }, (_, i) => {
      const day = dayAt(dayIndex(monday) + i);
      return { day, weekday: "", date: "", off: i === 6 ? "Weekend" : null, classes: classes.filter((c) => c.day === day) };
    }),
  });
  const exams = ev({ key: "phase:midterm", layer: "exams", day: "2026-11-02", endDay: "2026-11-10", title: "Midterm exams" });
  return new Map([
    ["2026-11-02", week("2026-11-02", [exams, ev({ key: "deadline:1", layer: "deadlines", day: "2026-11-04", time: "17:00" }), ev({ key: "deadline:2", layer: "deadlines", day: "2026-11-03", time: "23:59" }), ev({ key: "holiday:x", layer: "holidays", day: "2026-11-05", title: "Constitution Day" }), ev({ key: "deadline:sun", layer: "deadlines", day: "2026-11-08", time: "12:00" })], [cls("2026-11-02", "10:00"), cls("2026-11-04", "10:00"), cls("2026-11-07", "09:00")])],
    ["2026-11-09", week("2026-11-09", [exams], [cls("2026-11-09", "10:00")])],
  ]);
}

const keysOf = (l: { classes: ScheduleClass[] } & ({ markers: Array<{ key: string }>; offs: Array<{ key: string }>; lanes: Array<{ key: string }> } | { lanes: Array<{ key: string }>; single: CalendarEvent[] })) =>
  [...l.classes.map((c) => c.key), ...l.lanes.map((x) => x.key), ...("markers" in l ? [...l.markers, ...l.offs].map((x) => x.key) : l.single.map((e) => e.key))].sort();

describe("Timetable: one model, two views", () => {
  it("places the same classes and events in the week and in the month for a range", () => {
    const w = weeks();
    const days = Array.from({ length: 14 }, (_, i) => dayAt(dayIndex("2026-11-02") + i));
    const week = weekLayout(w, days, { start: 9, end: 20 });
    const month = monthLayout(w, days);
    expect(keysOf(week)).toEqual(keysOf(month));
    // Saturday's class and Sunday's deadline are in both; the exam week once, though both weeks carry it.
    expect(keysOf(week)).toContain(cls("2026-11-07", "09:00").key);
    expect(keysOf(week)).toContain("deadline:sun");
    expect(keysOf(week).filter((k) => k === "phase:midterm")).toHaveLength(1);
    expect(between(w, days[0], days.at(-1)!).loaded).toBe(true);
    expect(between(w, "2026-11-16", "2026-11-17").loaded).toBe(false);
  });

  it("lays the week out: deadlines inside the hours as lines, a holiday as its day's reason, the rest as bars", () => {
    const l = weekLayout(weeks(), Array.from({ length: 7 }, (_, i) => dayAt(dayIndex("2026-11-02") + i)), { start: 9, end: 20 });
    expect(l.markers.map((m) => [m.key, m.day, m.minutes])).toEqual([["deadline:1", 2, 1020], ["deadline:sun", 6, 720]]);
    expect(l.offs.map((o) => [o.key, o.day])).toEqual([["holiday:x", 3]]);
    expect(l.lanes.map((x) => [x.key, x.from, x.to, x.lane])).toEqual([["phase:midterm", 0, 6, 0], ["deadline:2", 1, 1, 1]]);
  });

  it("switching the view keeps the day and the open lesson", () => {
    const s = { view: "week" as const, day: "2026-11-18", open: "101@2026-11-18T05:00:00.000Z" };
    const m = switchView(s, "month");
    expect(m).toEqual({ ...s, view: "month" });
    expect(switchView(m, "week")).toEqual(s);
    expect(scheduleQuery(m, "2026-11-02")).toBe("/timetable?view=month&day=2026-11-18&class=101%402026-11-18T05%3A00%3A00.000Z");
    // Today needs no ?day=.
    expect(scheduleQuery({ view: "week", day: "2026-11-02", open: null }, "2026-11-02")).toBe("/timetable");
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
    expect(classByKey(weeks(), cls("2026-11-09", "10:00").key)?.day).toBe("2026-11-09");
  });

  it("lists what is coming up once, a running phase first", () => {
    const list = comingUp(
      [
        ev({ key: "phase:reg", layer: "registration", day: "2026-10-20", endDay: "2026-11-20" }),
        ev({ key: "deadline:1", layer: "deadlines", day: "2026-11-04" }),
        ev({ key: "deadline:1", layer: "deadlines", day: "2026-11-04" }),
        ev({ key: "deadline:old", layer: "deadlines", day: "2026-10-30" }),
      ],
      "2026-11-02",
    );
    expect(list.map((e) => e.key)).toEqual(["phase:reg", "deadline:1"]);
  });
});

describe("the lesson panel picks that dated lesson's facts", () => {
  const unix = (d: Date) => Math.floor(d.getTime() / 1000);
  const events = [
    { lesson_id: "L14", lesson_name: "Lecture № 14", status: 3, at: unix(at("2026-10-28", "10:00")) },
    { lesson_name: "Lecture № 13", status: 1, qr_auto_set_status: 1, at: unix(at("2026-10-26", "10:05")) },
    { lesson_name: "Tutorial № 13", status: 2, at: unix(at("2026-10-26", "14:00")) },
  ];

  it("matches the gradebook by lesson id, else by date and time", () => {
    expect(gradebookEntry(events, { start: at("2026-10-28", "10:00").toISOString(), lessonIds: ["L14"] })?.lesson_name).toBe("Lecture № 14");
    expect(gradebookEntry(events, { start: at("2026-10-26", "10:00").toISOString(), lessonIds: [] })?.lesson_name).toBe("Lecture № 13");
    expect(gradebookEntry(events, { start: at("2026-10-26", "14:00").toISOString(), lessonIds: [] })?.lesson_name).toBe("Tutorial № 13");
    expect(gradebookEntry(events, { start: at("2026-10-27", "10:00").toISOString(), lessonIds: [] })).toBeNull();
  });

  it("reads the mark, and says 'Not marked yet' for today and later", () => {
    const now = at("2026-11-02", "12:00");
    expect(attendanceOf(events[0], { start: at("2026-10-28", "10:00").toISOString() }, now)).toEqual({ mark: "absent", label: "Absent", viaQr: false });
    expect(attendanceOf(events[1], { start: at("2026-10-26", "10:00").toISOString() }, now)).toEqual({ mark: "present", label: "Present", viaQr: true });
    expect(attendanceOf(null, { start: at("2026-11-02", "10:00").toISOString() }, now)).toEqual({ mark: "upcoming", label: "Not marked yet", viaQr: false });
    expect(attendanceOf(null, { start: at("2026-11-09", "10:00").toISOString() }, now).label).toBe("Not marked yet");
    expect(attendanceOf(null, { start: at("2026-10-20", "10:00").toISOString() }, now)).toEqual({ mark: "unmarked", label: "Not in the LMS gradebook", viaQr: false });
  });

  it("lists the course's homework due that day", () => {
    const hw = [
      { homework_id: 1, subject: { id: "101", name: "Calculus 1" }, theme_name: "Problem set 8", time: unix(at("2026-11-04", "23:59")), status_name: "Не готово" },
      { homework_id: 2, subject: "Physics 1", theme_name: "Lab 6", time: unix(at("2026-11-04", "13:00")), status_name: "In process" },
      { homework_id: 3, subject: "Calculus 1", theme_name: "Quiz prep", time: unix(at("2026-11-05", "10:00")), status_name: "In process" },
    ];
    const due = homeworkFor(hw, { courseId: "101", name: "Calculus 1", start: at("2026-11-04", "10:00").toISOString() });
    expect(due.map((h) => [h.title, h.status])).toEqual([["Problem set 8", "Not submitted"]]);
  });

  it("gives a lesson the LMS has not dated the syllabus topic of its week", () => {
    expect(syllabusTopic({ 8: "Derivatives" }, "2026-11-04")).toBe("Week 8 · Derivatives");
    expect(syllabusTopic({ 8: "Derivatives" }, "2026-12-08")).toBeNull();
    expect(syllabusTopic(undefined, "2026-11-04")).toBeNull();
  });
});
