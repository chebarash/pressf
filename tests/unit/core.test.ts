import { describe, expect, it } from "vitest";
import { agenda, checkInOpen, firstAfter, mergeBlocks, type ClassEvent } from "@/core/agenda";
import { attendance, attendanceEvents, attendanceLine, newAbsences } from "@/core/attendance";
import { deadline, dueSoon, remindersDue } from "@/core/deadlines";
import { byWeek, cleanTitle, describeFile, downloadName, formatOf, typeOf, uploadTitle, weekOf } from "@/core/files";
import { changedGrades, tier } from "@/core/grades";
import { hashToken, linkExpired, newLinkToken, tokenMatches } from "@/core/link-tokens";
import { miniAppUrl, parseStartParam, path, startParam, uploadLink, type Target } from "@/core/links";
import { deliverNow, filterFeed, fromLms, mergeFeed, plainText, sections, unreadCount, type FeedItem } from "@/core/notifications";
import { displayName, initials, roleOf, shortName } from "@/core/people";
import { decodePayload, parseQr, qrOutcome, shouldRetry } from "@/core/qr";
import { askLevel, canEdit, canSubmit, difficultyWord, HOURS, HOURS_LABEL, hoursLabel, rateQueue, summarizeCourse, summarizeTeacher, termKey, toHours, validateRating, type RatingInput, type StoredRating } from "@/core/ratings";
import { adminSections, can, isStaff } from "@/core/roles";
import { dayInfo, nextPhase, termMatches, termSlug, weekLabel, weekOf as calWeek, type CalendarWeek } from "@/core/semester";
import { ago, clock, localDay, until } from "@/core/time";
import { canMove, rejectMessage, routeUpload, shownAs, trustOf } from "@/core/uploads";

/** Tashkent wall-clock time → Date. */
const at = (local: string) => new Date(`${local}+05:00`);

describe("time", () => {
  it("uses Tashkent days and clocks", () => {
    expect(localDay(new Date("2026-11-02T20:30:00Z"))).toBe("2026-11-03");
    expect(clock(at("2026-11-03T10:05:00"))).toBe("10:05");
  });
  it("says how long ago and until", () => {
    const now = at("2026-11-03T12:00:00");
    expect(ago(at("2026-11-03T11:55:00"), now)).toBe("5 min ago");
    expect(ago(at("2026-11-03T09:00:00"), now)).toBe("3 h ago");
    expect(ago(at("2026-11-02T09:00:00"), now)).toBe("yesterday");
    expect(ago(at("2026-10-20T09:00:00"), now)).toBe("20 Oct");
    expect(until(at("2026-11-03T12:25:00"), now)).toBe("in 25 min");
    expect(until(at("2026-11-04T09:00:00"), now)).toBe("tomorrow");
  });
});

describe("semester", () => {
  it("names past semesters in URLs", () => {
    expect(termSlug("Fall 2025")).toBe("fall-2025");
    expect(termSlug(" Spring 2026 ")).toBe("spring-2026");
    expect(termMatches("Fall 2025", "fall-2025")).toBe(true);
    expect(termMatches("Fall 2025", "Fall%202025")).toBe(true);
    expect(termMatches("Fall 2025", "fall-2026")).toBe(false);
    expect(termMatches("Fall 2025", "")).toBe(false);
    expect(termMatches("Fall 2025", "%E0%A4%A")).toBe(false);
  });
  const weeks: CalendarWeek[] = [
    { order: 1, label: "W1", starts: "2026-09-07", ends: "2026-09-11", term: "fall", week: 1, kind: "teaching" },
    { order: 2, label: "W2", starts: "2026-09-14", ends: "2026-09-18", term: "fall", week: 2, kind: "teaching" },
    { order: 3, label: "Mid", starts: "2026-09-21", ends: "2026-09-25", term: "fall", week: null, kind: "midterm" },
    { order: 4, label: "Brk", starts: "2026-09-28", ends: "2026-10-02", term: "fall", week: null, kind: "break" },
    { order: 5, label: "Brk", starts: "2026-10-05", ends: "2026-10-09", term: "fall", week: null, kind: "break" },
  ];
  it("labels weeks from the calendar, weekends belong to the week that ended", () => {
    expect(weekLabel(calWeek("2026-09-15", weeks), weeks)).toBe("Week 2 of 2");
    expect(calWeek("2026-09-13", weeks)?.order).toBe(1);
    expect(weekLabel(calWeek("2026-09-22", weeks), weeks)).toBe("Midterm exams");
  });
  it("knows study days, weekends and holidays", () => {
    expect(dayInfo(at("2026-09-08T09:00:00"), weeks, []).studyDay).toBe(true);
    expect(dayInfo(at("2026-09-12T09:00:00"), weeks, []).weekend).toBe(true);
    const h = dayInfo(at("2026-09-08T09:00:00"), weeks, [{ date: "2026-09-08", name: "Holiday" }]);
    expect(h.holiday?.name).toBe("Holiday");
    expect(h.studyDay).toBe(false);
  });
  it("joins consecutive weeks of one kind into a phase", () => {
    const p = nextPhase(at("2026-09-15T09:00:00"), ["break"], weeks);
    expect(p).toMatchObject({ starts: "2026-09-28", ends: "2026-10-09", inDays: 13 });
  });
  it("reads the real calendar", () => {
    expect(dayInfo(at("2026-12-08T10:00:00")).holiday?.name).toBe("Constitution Day");
  });
});

describe("agenda", () => {
  const ev = (course: string, from: string, to: string, extra: Partial<ClassEvent> = {}): ClassEvent => ({
    courseId: course, courseName: course, kind: "lecture", start: at(`2026-11-03T${from}:00`), end: at(`2026-11-03T${to}:00`), room: "B-204", ...extra,
  });
  const info = dayInfo(at("2026-11-03T08:00:00"), [{ order: 1, label: "W9", starts: "2026-11-02", ends: "2026-11-06", term: "fall", week: 9, kind: "teaching" }], []);
  const blocks = mergeBlocks([ev("calc", "10:00", "10:50", { lessonId: "1" }), ev("calc", "11:00", "11:50", { lessonId: "2" }), ev("phys", "13:00", "14:20"), ev("cs", "15:00", "16:20")]);

  it("merges consecutive hours of one class", () => {
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ courseId: "calc", lessonIds: ["1", "2"] });
    expect(clock(blocks[0].end)).toBe("11:50");
  });
  it("keeps different rooms apart", () => {
    expect(mergeBlocks([ev("calc", "10:00", "10:50"), ev("calc", "11:00", "11:50", { room: "A-108" })])).toHaveLength(2);
  });
  it("walks through the day", () => {
    expect(agenda(at("2026-11-03T08:00:00"), blocks, info).state).toBe("before");
    const running = agenda(at("2026-11-03T10:30:00"), blocks, info);
    expect(running.state).toBe("running");
    expect(running.current?.courseId).toBe("calc");
    expect(running.next?.courseId).toBe("phys");
    expect(agenda(at("2026-11-03T12:30:00"), blocks, info).state).toBe("between");
    expect(agenda(at("2026-11-03T17:00:00"), blocks, info).state).toBe("over");
    expect(agenda(at("2026-11-03T17:00:00"), [], info).state).toBe("free");
  });
  it("opens QR check-in 5 minutes before class", () => {
    expect(checkInOpen(blocks[0], at("2026-11-03T09:56:00"))).toBe(true);
    expect(checkInOpen(blocks[0], at("2026-11-03T09:50:00"))).toBe(false);
  });
  it("finds tomorrow's first class", () => {
    const tomorrow = mergeBlocks([{ ...ev("calc", "10:00", "11:00"), start: at("2026-11-04T10:00:00"), end: at("2026-11-04T11:00:00") }]);
    expect(firstAfter(at("2026-11-03T18:00:00"), [...blocks, ...tomorrow])?.courseId).toBe("calc");
  });
});

describe("attendance", () => {
  it("counts missed and left", () => {
    const a = attendance({ absence_count_all: "9", avaibale_count_all: "2", lessons_count: 60 })!;
    expect(a).toMatchObject({ missed: 9, left: 2, limit: 11, status: "low" });
    expect(attendanceLine(a)).toBe("2 absences left");
    expect(attendance({ absence_count_all: 11, avaibale_count_all: 0 })!.status).toBe("last");
    expect(attendance({ absence_count_all: 12, avaibale_count_all: -1 })!.status).toBe("over");
    expect(attendance(null)).toBeNull();
  });
  it("reads marks and finds new absences", () => {
    const before = attendanceEvents([{ lesson_name: "Lecture № 14", status: 1, qr_auto_set_status: 1, time: 1730700000, lesson_type: 0 }]);
    expect(before[0]).toMatchObject({ mark: "present", viaQr: true, kind: "lecture" });
    const after = attendanceEvents([
      { lesson_name: "Lecture № 14", status: 1, time: 1730700000 },
      { lesson_name: "Practice № 14", status: 3, time: 1730800000, lesson_type: 1 },
    ]);
    expect(newAbsences(before, after).map((e) => e.lesson)).toEqual(["Practice № 14"]);
    expect(newAbsences(after, after)).toEqual([]);
  });
});

describe("qr", () => {
  const samples = [
    ["MjE1MTgxNTE3NnJmZXFDWkhRc3dGZ3pVdWZlcDNITHpzLW1VMFh4V1NRMTczNzQ0MTQ2Nw==", "2151815176", 1737441467],
    ["NDUyNDMwNDY2TGJHU3NRaGl3cWI0WDY0OHA4ZEZNSmIwZklIVVBZdjE3MzA3MjE2OTc=", "452430466", 1730721697],
    ["MzU1MjI0MThMazNhYkZsRmdQUDVzRExmYTlYcG15WGlfc2ctZlBzZzE3MjcxNzMyMzE=", "35522418", 1727173231],
  ] as const;
  it.each(samples)("decodes %s", (token, id, ts) => {
    const p = decodePayload(token)!;
    expect(p.id).toBe(id);
    expect(p.key.length).toBeGreaterThanOrEqual(31);
    expect(p.createdAt.getTime()).toBe(ts * 1000);
  });
  it("accepts only LMS QR links", () => {
    expect(parseQr(`https://api.newuzbekistan.hero.study/v1/q-r/code-active?url=${samples[0][0]}`)).toMatchObject({ ok: true, token: samples[0][0] });
    expect(parseQr("https://evil.example/v1/q-r/code-active?url=x")).toEqual({ ok: false, reason: "wrong-site" });
    expect(parseQr("hello")).toEqual({ ok: false, reason: "not-a-link" });
    expect(parseQr("https://api.newuzbekistan.hero.study/v1/q-r/code-active")).toEqual({ ok: false, reason: "no-code" });
  });
  it("reads the LMS answer", () => {
    expect(qrOutcome(200, { result: "success", data: { subject: "Calculus 1" } })).toMatchObject({ kind: "marked", subject: "Calculus 1" });
    expect(qrOutcome(200, { result: "failed", data: { subject: "Physics 1" } })).toMatchObject({ kind: "not-your-class" });
    expect(qrOutcome(200, { result: "failed" })).toEqual({ kind: "expired" });
    expect(qrOutcome(404, { error: "QR Code not found" })).toEqual({ kind: "not-found" });
  });
  it("retries offline scans for two minutes", () => {
    const t = at("2026-11-03T10:00:00");
    expect(shouldRetry(t, at("2026-11-03T10:01:30"))).toBe(true);
    expect(shouldRetry(t, at("2026-11-03T10:02:30"))).toBe(false);
  });
});

describe("files", () => {
  it("cleans LMS names without repeating the week, type or course", () => {
    expect(describeFile("Week 3_L5.pdf")).toEqual({ title: "Lecture 5", type: "lecture", format: "pdf", week: 3 });
    expect(cleanTitle("MATH111 Lecture 5 - Derivatives (1).pptx", { courseCode: "MATH111" })).toBe("Lecture 5 — Derivatives");
    expect(cleanTitle("Calculus 1 - Practice problems_final.docx", { courseName: "Calculus 1" })).toBe("Practice problems");
    expect(cleanTitle("week_02 limits and continuity.pdf")).toBe("Limits and continuity");
    expect(cleanTitle(".pdf")).toBe("Untitled file");
  });
  it("classifies type, format and week", () => {
    expect(typeOf("Midterm 2024.pdf")).toBe("exam");
    expect(typeOf("Midterm review slides.pdf")).toBe("lecture");
    expect(typeOf("Final exam revision lecture.pptx")).toBe("lecture");
    expect(typeOf("Mock midterm with answers.pdf")).toBe("mock");
    expect(typeOf("Syllabus MATH111.pdf")).toBe("syllabus");
    expect(typeOf("Lab 5 report template.docx")).toBe("lab");
    expect(typeOf("Tutorial 3.pdf")).toBe("practice");
    expect(typeOf("Quiz 2 solutions.pdf")).toBe("exam");
    expect(formatOf("a.PPTX")).toBe("slides");
    expect(formatOf("lab.ipynb")).toBe("code");
    expect(formatOf("https://youtu.be/x")).toBe("link");
    expect(formatOf("x.bin")).toBe("other");
    expect(weekOf("W12 notes")).toBe(12);
    expect(weekOf("Lecture 12")).toBeNull();
  });
  it("names uploads and downloads", () => {
    expect(uploadTitle({ type: "exam", exam: "midterm", term: "Fall 2025" })).toBe("Midterm exam, Fall 2025");
    expect(uploadTitle({ type: "mock", exam: "final" })).toBe("Final mock");
    expect(uploadTitle({ type: "notes", note: "quiz 2 solutions" })).toBe("Quiz 2 solutions");
    expect(downloadName("Midterm exam, Fall 2025", "Calculus 1", "pdf", "pdf")).toBe("Midterm exam, Fall 2025 — Calculus 1.pdf");
    expect(downloadName('a/b:"c"', "X", "other", "")).toBe("a b c — X");
  });
  it("groups by week with loose files last", () => {
    const g = byWeek([{ week: 2 }, { week: null }, { week: 1 }, { week: 2 }]);
    expect(g.map((x) => [x.week, x.files.length])).toEqual([[1, 1], [2, 2], [null, 1]]);
  });
});

describe("ratings", () => {
  const base: RatingInput = { recommend: "yes", hours: "5-10", difficulty: 4, tags: ["Useful later"], teachers: [{ teacherId: "t1", role: "lecture", pressF: true, tags: ["Explains clearly"] }] };
  it("needs only the recommend answer", () => {
    expect(canSubmit(base)).toBe(true);
    expect(canSubmit({ ...base, hours: null, difficulty: null, tags: [], teachers: [] })).toBe(true);
    expect(validateRating({ ...base, recommend: null })).toContain("recommend-required");
    expect(validateRating({ ...base, tags: ["Useful later", "Fair exams", "Heavy reading", "Strict attendance"] })).toContain("too-many-tags");
    expect(validateRating({ ...base, tags: ["Made up" as never] })).toContain("unknown-tag");
    expect(validateRating({ ...base, teachers: [base.teachers[0], base.teachers[0]] })).toContain("duplicate-teacher");
  });
  it("asks hours in the four D5 buckets", () => {
    expect(HOURS).toEqual(["0-2", "2-5", "5-10", "10+"]);
    expect(HOURS.map((h) => HOURS_LABEL[h])).toEqual(["< 2", "2–5", "5–10", "10+"]);
    for (const h of HOURS) expect(validateRating({ ...base, hours: h })).toEqual([]);
    expect(validateRating({ ...base, hours: "4-6" as never })).toContain("bad-hours");
    expect([null, "0-2", "2-5", "10+", "2-4", "nonsense"].map(toHours)).toEqual([null, "0-2", "2-5", "10+", null, null]);
  });
  it("summarizes hours by bucket midpoints", () => {
    const at = (hs: Array<RatingInput["hours"]>) => summarizeCourse(hs.map((hours) => ({ ...base, hours, term: "Fall 2025", courseId: "MATH111" })));
    const mid = (hs: Array<RatingInput["hours"]>) => { const s = at(hs); return s.enough ? s.hours : undefined; };
    expect(mid(["0-2", "0-2", "0-2", "0-2", "0-2"])).toBe(1);
    expect(mid(["2-5", "2-5", "2-5", "0-2", "10+"])).toBe(3.5);
    expect(mid(["5-10", "5-10", "5-10", "10+", "10+"])).toBe(7.5);
    expect(mid(["10+", "10+", "10+", null, null])).toBe(12);
    expect(mid([null, null, null, null, null])).toBeNull();
    expect(hoursLabel(3.5)).toBe("4 h");
    expect(hoursLabel(7.5)).toBe("8 h");
  });
  const rows = (n: number, term: string, yes: number, over: Partial<RatingInput> = {}): StoredRating[] =>
    Array.from({ length: n }, (_, i) => ({ ...base, ...over, recommend: i < yes ? "yes" : "no", term, courseId: "MATH111", teachers: [{ teacherId: "t1", role: "lecture", pressF: i < yes, tags: i % 2 ? ["Explains clearly"] : [] }] }));

  it("hides numbers under five ratings", () => {
    expect(summarizeCourse(rows(4, "Fall 2025", 4))).toEqual({ enough: false, count: 4 });
    expect(summarizeTeacher("t1", rows(4, "Fall 2025", 4))).toEqual({ enough: false, count: 4 });
  });
  it("summarizes a course with a semester trend", () => {
    const s = summarizeCourse([...rows(5, "Fall 2024", 3), ...rows(10, "Fall 2025", 8), ...rows(3, "Spring 2026", 3)]);
    if (!s.enough) throw new Error("expected enough");
    expect(s.count).toBe(18);
    expect(s.recommendPct).toBe(78);
    expect(s.hours).toBe(7.5);
    expect(s.difficulty).toBe(4);
    expect(s.trend.map((p) => [p.term, p.value])).toEqual([["Fall 2024", 60], ["Fall 2025", 80]]);
    expect(s.delta).toBe(20);
    expect(s.tags[0]).toEqual({ tag: "Useful later", pct: 100 });
  });
  it("summarizes a teacher per course and role", () => {
    const s = summarizeTeacher("t1", rows(10, "Fall 2025", 9));
    if (!s.enough) throw new Error("expected enough");
    expect(s.pressFPct).toBe(90);
    expect(s.byCourse).toEqual([{ courseId: "MATH111", role: "lecture", pct: 90, count: 10 }]);
    expect(s.tags[0]).toEqual({ tag: "Explains clearly", pct: 50 });
  });
  it("orders terms and builds the queue", () => {
    expect(termKey("Fall 2025")).toBeGreaterThan(termKey("Spring 2025"));
    expect(canEdit("Fall 2025", "Spring 2026")).toBe(true);
    expect(canEdit("Fall 2025", "Fall 2026")).toBe(false);
    const q = rateQueue([{ courseId: "a", term: "Fall 2025" }, { courseId: "b", term: "Spring 2026" }, { courseId: "c", term: "Fall 2026" }], new Set(["a|Fall 2025"]), "Fall 2026");
    expect(q.map((c) => c.courseId)).toEqual(["b"]);
    expect(difficultyWord(3.2)).toBe("Hard-ish");
  });
  it("gets louder but never disappears", () => {
    expect(askLevel(0, 5, 30)).toBe("none");
    expect(askLevel(2, 0, 0)).toBe("card");
    expect(askLevel(2, 1, 0)).toBe("banner");
    expect(askLevel(2, 0, 20)).toBe("shine");
  });
});

describe("notifications", () => {
  it("turns LMS HTML into text and flags acknowledgements", () => {
    expect(plainText("<p>Quiz 6 &amp; 7</p><ul><li>one</li></ul>")).toBe("Quiz 6 & 7\n• one");
    expect(plainText("<scr<b>ipt>alert(1)</script>")).not.toMatch(/[<>]/);
    expect(plainText("&lt;script&gt;x")).toBe("‹script›x");
    const item = fromLms({ id: 5, title: "<b>Quiz</b>", body: "<p>Opens 09:00</p>", publicate_at: "2026-11-02 18:00:00", read: 1, required: 1, acquainted: 0 });
    expect(item).toMatchObject({ id: "lms:5", title: "Quiz", body: "Opens 09:00", needsAck: true, read: false });
    expect(item.at.toISOString()).toBe("2026-11-02T13:00:00.000Z");
  });
  const mk = (id: string, kind: FeedItem["kind"], when: string, read = false): FeedItem => ({ id, kind, title: id, at: at(when), read });
  it("merges, counts, sections and filters", () => {
    const feed = mergeFeed([mk("a", "grade", "2026-11-03T09:00:00", true)], [mk("a", "grade", "2026-11-03T09:00:00"), mk("b", "file", "2026-10-30T09:00:00", true), mk("c", "announcement", "2026-10-01T09:00:00")]);
    expect(feed.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(unreadCount(feed)).toBe(2);
    expect(sections(feed, at("2026-11-03T12:00:00")).map((s) => [s.title, s.items.length])).toEqual([["Today", 1], ["This week", 1], ["Earlier", 1]]);
    expect(filterFeed(feed, "file").map((i) => i.id)).toEqual(["b"]);
  });
  it("keeps quiet hours except for absences", () => {
    expect(deliverNow("grade", 23 * 60)).toBe(false);
    expect(deliverNow("grade", 22 * 60 + 30)).toBe(true);
    expect(deliverNow("absence", 23 * 60)).toBe(true);
    expect(deliverNow("grade", 9 * 60)).toBe(true);
  });
});

describe("links", () => {
  const targets: Target[] = [
    { to: "course", code: "MATH111" }, { to: "file", id: "8812" }, { to: "professor", id: "4512" },
    { to: "rate", courseId: "77" }, { to: "next", code: "MATH211" }, { to: "link", token: "abc-DEF_1" }, { to: "qr" }, { to: "notifications" },
  ];
  it.each(targets)("round-trips $to through startapp", (t) => {
    const p = startParam(t);
    expect(p).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(parseStartParam(p)).toEqual(t);
  });
  it("builds paths and URLs", () => {
    expect(path({ to: "course", code: "MATH111", tab: "files", term: "Fall 2025" })).toBe("/c/MATH111/files?term=Fall%202025");
    expect(miniAppUrl({ to: "course", code: "MATH111" })).toBe("https://t.me/pressfapp?startapp=c_MATH111");
    expect(uploadLink("MATH 111")).toBe("https://t.me/pressfapp?start=upload_MATH111");
    expect(parseStartParam("garbage")).toEqual({ to: "today" });
    expect(parseStartParam(null)).toEqual({ to: "today" });
  });
  it("issues one-time tokens that store only a hash", () => {
    const token = newLinkToken();
    const stored = hashToken(token, "secret");
    expect(stored).not.toContain(token);
    expect(tokenMatches(token, stored, "secret")).toBe(true);
    expect(tokenMatches(token + "x", stored, "secret")).toBe(false);
    expect(linkExpired(at("2026-11-03T10:00:00"), at("2026-11-03T10:11:00"))).toBe(true);
  });
});

describe("uploads, roles, people, grades, deadlines", () => {
  it("earns trust and routes uploads", () => {
    expect(trustOf({ live: 5, rejected: 0 })).toBe("trusted");
    expect(trustOf({ live: 9, rejected: 1 })).toBe("normal");
    expect(trustOf({ live: 9, rejected: 0, manualTrust: "paused" })).toBe("paused");
    expect(routeUpload("trusted", 0.5)).toBe("live");
    expect(routeUpload("trusted", 0.05)).toBe("waiting");
    expect(routeUpload("normal", 0.5)).toBe("waiting");
    expect(routeUpload("paused", 0.5)).toBe("refuse");
    expect(canMove("waiting", "live")).toBe(true);
    expect(canMove("live", "waiting")).toBe(false);
    expect(rejectMessage("Physics 1 notes", "Physics 1", "unreadable")).toMatch(/^Not accepted: Physics 1 notes\nReason: We couldn't open/);
    expect(shownAs(false, "Aziz T.")).toBe("From students");
    expect(shownAs(true, "Aziz T.")).toBe("From Aziz T.");
  });
  it("grants by role", () => {
    expect(can("guest", "read:files")).toBe(false);
    expect(can("student", "rate")).toBe(true);
    expect(can("moderator", "admin:people")).toBe(false);
    expect(isStaff("admin")).toBe(true);
    expect(adminSections("moderator").map((s) => s.id)).toEqual(["overview", "uploads", "reports", "audit"]);
  });
  it("names people", () => {
    // hero.study: first_name given, sur_name family, last_name patronymic.
    expect(displayName({ first_name_en: "GONÇALO", last_name_en: "", sur_name_en: "pinto" })).toBe("Gonçalo Pinto");
    expect(displayName({ first_name_en: "Vohid", last_name_en: "Akmalovich", sur_name_en: "Kholov" })).toBe("Vohid Kholov");
    expect(displayName({ first_name_en: "Ann", last_name_en: "Lee", sur_name_en: "" })).toBe("Ann Lee");
    expect(shortName("Shamsiddin Abdurakhimov")).toBe("Shamsiddin A.");
    expect(initials("Aziz Tursunov")).toBe("AT");
    expect(roleOf("Laboratory")).toBe("lab");
    expect(roleOf("Lecture")).toBe("lecture");
  });
  it("colours and diffs marks", () => {
    expect(tier(91)).toBe("High");
    expect(tier(70)).toBe("Mid");
    expect(tier(null)).toBe("None");
    expect(changedGrades({ a: 80, b: null }, { a: 80, b: 86, c: 40 })).toEqual([{ key: "b", mark: 86, previous: null }, { key: "c", mark: 40, previous: null }]);
  });
  it("lists deadlines and reminder moments", () => {
    const now = at("2026-11-03T12:00:00");
    const t = (d: string) => String(at(d).getTime() / 1000);
    const list = dueSoon([
      { id: 1, subject: "SPM", theme_name: "Risk plan", time: t("2026-11-05T23:59:00"), status_name: "Not ready" },
      { id: 2, subject: { name: "Physics 1" }, theme_name: "Lab 6", time: t("2026-11-04T23:59:00"), status_name: "In process" },
      { id: 3, subject: "X", theme_name: "Done", time: t("2026-11-04T23:59:00"), status_name: "Checked" },
      { id: 4, subject: "X", theme_name: "Far", time: t("2026-12-30T23:59:00"), status_name: "Not ready" },
    ], now);
    expect(list.map((d) => d.title)).toEqual(["Lab 6", "Risk plan"]);
    const d = deadline({ id: 9, time: t("2026-11-05T12:00:00"), status_name: "Not ready" })!;
    expect(remindersDue(d, at("2026-11-03T12:01:00"), at("2026-11-03T11:00:00"))).toEqual([48]);
  });
});
