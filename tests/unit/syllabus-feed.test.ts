import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { alarmsFor, classDescription, cleanAlarms, DEFAULT_ALARMS, milestoneNote } from "@/core/calendar-text";
import { foldLine, icsCalendar, icsTrigger, subscribeLinks } from "@/core/ics";
import { DEFAULT_ALERTS } from "@/core/notifications";
import { milestoneAlerts } from "@/server/sync/convert";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} }),
  usePathname: () => "/timetable",
  useSearchParams: () => new URLSearchParams(),
}));
const { HintsProvider } = await import("@/ui/shell/Hints");
const { TimetableScreen } = await import("@/screens/desktop/split/TimetableScreen");
const { default: PhoneTimetable } = await import("@/screens/mobile/Timetable");
const { timetableDemo } = await import("@/screens/mobile/demo-b");
const { classMark, lessonPanel } = await import("@/screens/shared/schedule/lesson");
const { appLink, appOrder } = await import("@/screens/mobile/mc/Subscribe");

const SITE = "https://pressf.chebarash.uz";
const quiz = { title: "Quiz 2", weight: 10, of: 1, certainty: "inferred" as const };

describe("a class event's description", () => {
  it("has the topic, the milestone and the lesson's files as Press F page links", () => {
    const text = classDescription({
      head: "CS412 · Lecture", room: "B-204", teacher: "Gonçalo Pinto", topic: "Week 9 · CNNs", milestones: [quiz],
      files: [{ id: "F1", title: "Lecture 9 slides" }, { id: "U 2", title: "Notes, part 1" }], site: SITE, courseHref: "/c/CS412",
    });
    expect(text).toBe([
      "CS412 · Lecture", "Room B-204", "Gonçalo Pinto", "📝 Quiz 2 (10%) — from the syllabus, likely this lesson", "Syllabus: Week 9 · CNNs",
      "Files:", `• Lecture 9 slides: ${SITE}/f/F1`, `• Notes, part 1: ${SITE}/f/U%202`,
    ].join("\n"));
  });

  it("stays short: four files at most, then a count with the course link", () => {
    const files = Array.from({ length: 7 }, (_, i) => ({ id: `F${i}`, title: `File ${i}` }));
    const text = classDescription({ head: "CS412 · Lecture", files, site: SITE, courseHref: "/c/CS412" });
    expect(text.split("\n").filter((l) => l.startsWith("•"))).toHaveLength(4);
    expect(text.endsWith(`+3 more: ${SITE}/c/CS412`)).toBe(true);
  });

  it("names the weight the way the syllabus gives it", () => {
    expect(milestoneNote({ ...quiz, certainty: "stated" })).toBe("📝 Quiz 2 (10%) — from the syllabus");
    expect(milestoneNote({ title: "Quiz 1", weight: 30, of: 3, certainty: "stated" })).toBe("📝 Quiz 1 (30% for all 3) — from the syllabus");
    expect(milestoneNote({ title: "In-class quiz", weight: null, of: null, certainty: "stated" })).toBe("📝 In-class quiz — from the syllabus");
  });

  it("is escaped and folded in the .ics", () => {
    const description = classDescription({ head: "CS412 · Lecture", milestones: [quiz], files: [{ id: "F1", title: "Slides; week 9, part 2" }], site: SITE });
    const ics = icsCalendar({ name: "Press F", now: new Date("2026-11-02T00:00:00Z"), events: [{ uid: "a@x", summary: "📝 Deep Learning · Lecture", description, start: new Date("2026-11-09T05:00:00Z"), end: new Date("2026-11-09T06:20:00Z") }] });
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("DESCRIPTION:CS412 · Lecture\\n📝 Quiz 2 (10%) — from the syllabus\\, likely this lesson\\nFiles:\\n• Slides\\; week 9\\, part 2: https://pressf.chebarash.uz/f/F1");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(foldLine("x".repeat(200)).split("\r\n ").join("")).toBe("x".repeat(200));
  });
});

describe("VALARM", () => {
  it("writes reminders as RFC 5545 durations", () => {
    expect([15, 30, 60, 90, 1440, 2880].map(icsTrigger)).toEqual(["-PT15M", "-PT30M", "-PT1H", "-PT90M", "-P1D", "-P2D"]);
    const ics = icsCalendar({ name: "Press F", now: new Date("2026-11-02T00:00:00Z"), events: [
      { uid: "e@x", summary: "Calculus 1 midterm", start: new Date("2026-11-04T05:00:00Z"), end: new Date("2026-11-04T07:00:00Z"), alarms: alarmsFor("exam", DEFAULT_ALARMS, "Calculus 1 midterm") },
      { uid: "c@x", summary: "Calculus 1 · Lecture", start: new Date("2026-11-09T05:00:00Z"), end: new Date("2026-11-09T06:20:00Z"), alarms: alarmsFor("class", { classes: 30, exams: true }, "Calculus 1 · Lecture") },
    ] });
    const [exam, cls] = ics.split("BEGIN:VEVENT").slice(1);
    expect(exam).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Calculus 1 midterm\r\nTRIGGER:-P1D\r\nEND:VALARM\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Calculus 1 midterm\r\nTRIGGER:-PT1H\r\nEND:VALARM\r\nEND:VEVENT");
    expect(cls.match(/TRIGGER:[^\r\n]+/g)).toEqual(["TRIGGER:-PT30M"]);
    // VALARM sits inside its VEVENT.
    expect(cls.indexOf("BEGIN:VALARM")).toBeLessThan(cls.indexOf("END:VEVENT"));
  });

  it("follows the settings", () => {
    expect(alarmsFor("class", { classes: 0, exams: true }, "x")).toEqual([]);
    expect(alarmsFor("class", { classes: 15, exams: true }, "x", true).map((a) => a.minutes)).toEqual([1440, 15]);
    expect(alarmsFor("exam", { classes: 15, exams: false }, "x")).toEqual([]);
    expect(alarmsFor("milestone-day", DEFAULT_ALARMS, "x").map((a) => a.minutes)).toEqual([360]);
    expect(cleanAlarms(null)).toEqual({ classes: 15, exams: true });
    expect(cleanAlarms({ classes: 45, exams: "yes" })).toEqual({ classes: 15, exams: true });
    expect(cleanAlarms({ classes: 60, exams: false })).toEqual({ classes: 60, exams: false });
  });
});

describe("Subscribe in your calendar: each app's link", () => {
  const feed = "https://pressf.chebarash.uz/calendar/feed/abcDEF_-0123456789abcdefghijklmnop.ics";
  const links = subscribeLinks(feed, "Press F · Shams & Co", "https://pressf.chebarash.uz/calendar/apple?feed=abc");

  it("Google, Apple, Outlook.com, Microsoft 365 and the plain link", () => {
    expect(links.google).toBe(`https://calendar.google.com/calendar/render?cid=${encodeURIComponent("webcal://pressf.chebarash.uz/calendar/feed/abcDEF_-0123456789abcdefghijklmnop.ics")}`);
    expect(links.apple).toBe("webcal://pressf.chebarash.uz/calendar/feed/abcDEF_-0123456789abcdefghijklmnop.ics");
    expect(links.outlook).toBe("https://outlook.live.com/calendar/0/addfromweb?url=https%3A%2F%2Fpressf.chebarash.uz%2Fcalendar%2Ffeed%2FabcDEF_-0123456789abcdefghijklmnop.ics&name=Press%20F%20%C2%B7%20Shams%20%26%20Co");
    expect(links.office).toBe(links.outlook.replace("outlook.live.com", "outlook.office.com"));
    expect(links.feed).toBe(feed);
    expect(subscribeLinks(feed.replace("https://", "webcal://"), "x").feed).toBe(feed);
  });

  it("the viewer's own app first; Apple through Safari inside Telegram", () => {
    expect(appOrder("apple")[0]).toBe("apple");
    expect(appOrder("android")[0]).toBe("google");
    expect(appOrder("other")).toEqual(["google", "apple", "outlook", "office"]);
    expect(appLink(links, "apple", false)).toBe(links.apple);
    expect(appLink(links, "apple", true)).toBe("https://pressf.chebarash.uz/calendar/apple?feed=abc");
    expect(appLink(links, "outlook", true)).toBe(links.outlook);
  });
});

describe("the evening-before alert", () => {
  const base = { courseCode: "CS412", courseName: "Deep Learning", kind: "quiz" as const, title: "Quiz 2", weight: 10, of: 1, day: "2026-11-09", endDay: "2026-11-09", classKey: "k1", source: "Week 9" };

  it("says it plainly, with 'inferred' when only the week is known, and an idempotent id", () => {
    const [a] = milestoneAlerts([{ ...base, certainty: "stated" }], "2026-11-08", new Date());
    expect(a.item).toMatchObject({ id: "syllabus:CS412:2026-11-09:quiz-2:eve", kind: "deadline", title: "Tomorrow: Quiz 2 in Deep Learning (10%, from the syllabus)", href: "/c/CS412" });
    expect(a.setting).toBe("syllabus");
    expect(a.message.text).toContain("Tomorrow: Quiz 2 in Deep Learning (10%, from the syllabus)");
    const [b] = milestoneAlerts([{ ...base, certainty: "inferred" }], "2026-11-08", new Date());
    expect(b.item.title).toBe("Tomorrow: Quiz 2 in Deep Learning (10%, inferred from the syllabus)");
    expect(b.message.text).toContain("not the day");
    expect(b.item.id).toBe(a.item.id);
  });

  it("only for tomorrow, never on an exam that has its own reminder; a week-long one is 'This week'", () => {
    expect(milestoneAlerts([{ ...base, certainty: "stated" }], "2026-11-07", new Date())).toEqual([]);
    expect(milestoneAlerts([{ ...base, certainty: "stated" }], "2026-11-08", new Date(), new Set(["k1"]))).toEqual([]);
    const [w] = milestoneAlerts([{ ...base, title: "Project", weight: 25, classKey: null, day: "2026-11-09", endDay: "2026-11-13", certainty: "inferred" }], "2026-11-08", new Date());
    expect(w.item.title).toBe("This week: Project in Deep Learning (25%, inferred from the syllabus)");
  });

  it("is a setting of its own, on by default", () => {
    expect(DEFAULT_ALERTS.syllabus).toBe(true);
  });
});

describe("the mark on a class block, the same in every view", () => {
  const page = timetableDemo("sheet");
  const days = page.weeks.flatMap((w) => w.days);
  const c = days.flatMap((d) => d.classes).find((x) => x.day === page.day)!;
  c.milestones = [{ id: "m1", title: "Quiz 2", kind: "quiz", certainty: "inferred", weight: "10%", line: "Quiz 2 · 10% · from the syllabus (likely this lesson)" }];
  const render = (node: React.ReactElement) => renderToStaticMarkup(createElement(HintsProvider, { signedIn: true, telegramLinked: true, dismissed: [] }, node));

  it("classMark: the title, dashed when inferred, the rest counted", () => {
    expect(classMark(c)).toEqual({ text: "Quiz 2", title: "Quiz 2 · 10% · from the syllabus (likely this lesson)", likely: true });
    expect(classMark({ milestones: [...c.milestones!, { ...c.milestones![0], id: "m2", title: "Lab report 3", certainty: "stated" }] })?.text).toBe("Quiz 2 +1");
    expect(classMark({ milestones: [] })).toBeNull();
    expect(lessonPanel(c).milestones).toEqual([{ id: "m1", line: "Quiz 2 · 10% · from the syllabus (likely this lesson)", likely: true }]);
  });

  it("Week and Month on the desktop, Day on the phone, and the panel line", () => {
    for (const view of ["week", "month"] as const) {
      const html = render(createElement(TimetableScreen, { page: { ...page, view }, open: null, demo: true }));
      expect(html.match(/data-milestone="likely"/g)?.length, view).toBeGreaterThanOrEqual(1);
    }
    const phone = render(createElement(PhoneTimetable, { data: page, demo: true }));
    expect(phone).toContain('data-milestone="likely"');
    const panel = render(createElement(TimetableScreen, { page, open: c.key, demo: true }));
    expect(panel).toContain("Quiz 2 · 10% · from the syllabus (likely this lesson)");
  });
});
