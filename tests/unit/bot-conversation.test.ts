import { describe, expect, it } from "vitest";
import { answered, guess, newDraft, parseData, recentTerms, reduce, render, titleOf, type CourseOption, type Draft, type Event } from "@/lib/telegram/conversation";
import * as m from "@/lib/telegram/messages";

const calc: CourseOption = { id: "11", code: "MATH111", name: "Calculus 1" };
const phys: CourseOption = { id: "12", code: "PHYS101", name: "Physics 1" };
const cs: CourseOption = { id: "13", code: "CS101", name: "Computer Science 1" };
const eng: CourseOption = { id: "14", code: "ENG101", name: "Academic English" };
const courses = [calc, phys, cs, eng];
const file = { fileId: "f1", uniqueId: "u1", name: "calc1_midterm_2025.pdf", mime: "application/pdf", size: 2_400_000 };
const fall = new Date("2025-11-03T10:00:00Z");

const labels = (d: Draft) => render(d).keyboard!.inline_keyboard.map((row) => row.map((b) => b.text));
const run = (d: Draft, ...events: Event[]) => events.reduce(reduce, d);
const start = (extra: Partial<Parameters<typeof newDraft>[0]> = {}) =>
  reduce(newDraft({ id: "abc", courses, name: "Shamsiddin A.", now: fall, ...extra }), { kind: "file", file });

describe("share-a-file conversation", () => {
  it("asks for the course with the deep-linked one picked (11.2)", () => {
    const d = start({ linked: "math111" });
    expect(d.step).toBe("course");
    expect(render(d).text).toBe("<b>Got it. Which course is it for?</b>\nYou opened this from Calculus 1, so it's picked.");
    expect(labels(d)).toEqual([["✓ Calculus 1", "Physics 1"], ["Computer Science 1", "Academic English"], ["Another course…"]]);
  });

  it("asks without the deep-link line otherwise", () => {
    const d = reduce(newDraft({ id: "abc", courses: [phys], now: fall }), { kind: "file", file: { ...file, name: "notes.pdf" } });
    expect(render(d).text).toBe("<b>Got it. Which course is it for?</b>");
    expect(labels(d)).toEqual([["Physics 1", "Another course…"]]);
  });

  it("walks an exam through type, exam and semester, name and summary (11.3–11.4)", () => {
    let d = run(start({ linked: "MATH111" }), { kind: "course", index: 0 });
    expect(d.step).toBe("type");
    expect(render(d).text).toBe("<b>What is it?</b>");
    expect(labels(d)).toEqual([["✓ Past exam", "Mock"], ["Notes", "Lecture"], ["Other"]]);

    d = reduce(d, { kind: "type", type: "exam" });
    expect(d.step).toBe("exam");
    expect(render(d).text).toBe("<b>Which exam and semester?</b>");
    expect(labels(d)).toEqual([["✓ Midterm", "Final"], ["Quiz", "Fall 2025"], ["Spring 2025", "Older"]]);

    d = reduce(d, { kind: "term", index: 0 });
    expect(d.step).toBe("name");
    expect(render(d).text).toBe("<b>Show your name on it?</b>\nIf not, it shows as 'From students'.");
    expect(labels(d)).toEqual([["✓ Keep me anonymous"], ["Show 'Shamsiddin A.'"]]);

    d = reduce(d, { kind: "name", show: false });
    expect(d.step).toBe("confirm");
    expect(render(d).text).toBe([
      "<b>Ready to send:</b>",
      "<b>Midterm exam, Fall 2025</b>",
      "Calculus 1 · past exam · from students",
      "By sending you confirm it's OK to share: no live-exam answers, no one's personal data.",
    ].join("\n"));
    expect(labels(d)).toEqual([["Send for review", "Edit"]]);
    expect(reduce(d, { kind: "send" }).step).toBe("sending");
    expect(render(reduce(d, { kind: "send" })).keyboard).toBeUndefined();
  });

  it("needs both an exam and a semester before moving on", () => {
    let d = run(reduce(newDraft({ id: "a", courses, now: fall, name: "A B." }), { kind: "file", file: { ...file, name: "scan.pdf" } }), { kind: "course", index: 1 }, { kind: "type", type: "mock" });
    d = reduce(d, { kind: "exam", exam: "final" });
    expect(d.step).toBe("exam");
    expect(labels(d)[0]).toEqual(["Midterm", "✓ Final"]);
    d = reduce(d, { kind: "term", index: 2 });
    expect(d.term).toBeNull();
    expect(d.step).toBe("name");
    expect(titleOf(d)).toBe("Final mock");
  });

  it("skips the exam step for notes and titles them from the file", () => {
    const d = run(reduce(newDraft({ id: "a", courses, now: fall }), { kind: "file", file: { ...file, name: "Week 3_derivatives summary.pdf" } }), { kind: "course", index: 0 }, { kind: "type", type: "notes" });
    expect(d.step).toBe("confirm"); // no name known → no name question
    expect(titleOf(d)).toBe("Derivatives summary");
    expect(render(d).text).toContain("Calculus 1 · notes · from students");
  });

  it("shows the chosen name in the summary", () => {
    const d = run(start(), { kind: "course", index: 0 }, { kind: "type", type: "lecture" }, { kind: "name", show: true });
    expect(render(d).text).toContain("· lecture · from Shamsiddin A.");
    expect(d.showName).toBe(true);
  });

  it("Edit goes back to the course with the answers kept", () => {
    const done = run(start(), { kind: "course", index: 0 }, { kind: "type", type: "exam" }, { kind: "term", index: 0 }, { kind: "name", show: false });
    const d = reduce(done, { kind: "edit" });
    expect(d.step).toBe("course");
    expect(labels(d)[0][0]).toBe("✓ Calculus 1");
    expect(d.type).toBe("exam");
  });

  it("searches another course and offers the results", () => {
    let d = reduce(start(), { kind: "search" });
    expect(d.step).toBe("search");
    d = reduce(d, { kind: "results", courses: [{ id: "99", code: "HIST100", name: "World History" }] });
    expect(d.step).toBe("course");
    expect(labels(d)).toEqual([["World History", "Another course…"]]);
    expect(reduce(d, { kind: "course", index: 0 }).course?.code).toBe("HIST100");
  });

  it("ignores buttons from another step", () => {
    const d = start();
    expect(reduce(d, { kind: "type", type: "notes" })).toBe(d);
    expect(reduce(d, { kind: "send" })).toBe(d);
    expect(reduce(d, { kind: "course", index: 40 })).toBe(d);
  });

  it("records the answer under the question", () => {
    const before = start();
    const after = reduce(before, { kind: "course", index: 0 });
    expect(answered(before, after).text).toBe("<b>Got it. Which course is it for?</b>\n\n<b>Calculus 1 ✓</b>");
  });
});

describe("guesses and button data", () => {
  it("reads the course, type, exam and semester from the name", () => {
    expect(guess("MATH111 Midterm Fall 2025.pdf", courses, ["Fall 2025", "Spring 2025"])).toEqual({ type: "exam", exam: "midterm", course: calc, term: "Fall 2025" });
    expect(guess("IMG_2041.jpg", courses, ["Fall 2025"])).toEqual({ type: undefined, exam: undefined, course: undefined, term: undefined });
  });
  it("offers this semester and the one before", () => {
    expect(recentTerms(new Date("2026-11-03"))).toEqual(["Fall 2026", "Spring 2026"]);
    expect(recentTerms(new Date("2027-03-01"))).toEqual(["Spring 2027", "Fall 2026"]);
  });
  it("keeps button data within Telegram's 64 bytes and parses it back", () => {
    const d = start();
    for (const b of render(d).keyboard!.inline_keyboard.flat()) expect(Buffer.byteLength(b.callback_data!)).toBeLessThanOrEqual(64);
    expect(parseData("u:abc:c:2")).toEqual({ draft: "abc", event: { kind: "course", index: 2 } });
    expect(parseData("u:abc:t:exam")).toEqual({ draft: "abc", event: { kind: "type", type: "exam" } });
    expect(parseData("u:abc:t:syllabus")?.event).toBeNull();
    expect(parseData("approve:x")).toBeNull();
  });
});

describe("message builders", () => {
  const button = (msg: m.BotMessage) => msg.keyboard!.inline_keyboard[0][0];

  it("welcomes with the Open Press F button (9.5)", () => {
    const msg = m.welcome();
    expect(msg.text).toMatch(/^<b>Hi! I'm Press F\.<\/b>\nYour NewUU timetable/);
    expect(button(msg)).toEqual({ text: "Open Press F", web_app: { url: "https://pressf.test" } });
  });
  it("answers review outcomes (11.5)", () => {
    expect(m.sentForReview().text).toBe("<b>Sent for review ✓</b>\nA moderator checks it, usually within a day.");
    const live = m.fileLive("Midterm exam, Fall 2025", "Calculus 1", "MATH111");
    expect(live.text).toBe("<b>Your file is live 🎉</b>\nMidterm exam, Fall 2025 · Calculus 1 — marked 'From students'. Thanks, it helps the next cohort.");
    expect(button(live)).toEqual({ text: "Open in Calculus 1", web_app: { url: "https://pressf.test/c/MATH111/files" } });
    expect(m.notAccepted("Physics 1 notes", "it's the official lecture slides").keyboard!.inline_keyboard).toEqual([[{ text: "Got it", callback_data: "ok" }]]);
  });
  it("formats the admin's message with the right button", () => {
    const out = m.reviewOutcome("Not accepted: X · Physics 1.\nWe couldn't open it.\nThanks!", null);
    expect(out.text).toBe("<b>Not accepted: X · Physics 1.</b>\nWe couldn't open it.\nThanks!");
    expect(button(out).text).toBe("Got it");
    expect(button(m.reviewOutcome("Your file is live 🎉\nA", { courseName: "Calculus 1", courseCode: "MATH111" })).text).toBe("Open in Calculus 1");
  });
  it("words the daily alerts as designed (9.2)", () => {
    expect(m.morningDigest({ classes: [{ time: "10:00", course: "Calculus 1", room: "B-204" }, { time: "13:00", course: "Physics 1", room: "A-108" }], due: "Physics 1 lab report, 23:59" }).text)
      .toBe("<b>Today: 2 classes</b>\n10:00 Calculus 1 · B-204\n13:00 Physics 1 · A-108\nDue tonight: Physics 1 lab report, 23:59");
    expect(m.classSoon({ course: "Calculus 1", courseCode: "MATH111", room: "B-204", teacher: "Gonçalo Pinto", note: "Lecture 15 slides are up" }).text)
      .toBe("<b>Calculus 1 in 15 minutes</b>\nB-204 · Gonçalo Pinto · Lecture 15 slides are up");
    expect(m.markedAbsent({ course: "Physics 1", lesson: "Practice № 14", when: "Tue 3 Nov 13:00", left: 2 }).text).toBe("<b>Marked absent in Physics 1</b>\n🔴 Absent · Practice 14 · Tue 3 Nov 13:00\n⚠️ 2 absences left in this course");
    expect(m.markedAbsent({ course: "Physics 1", lesson: "Practice 15", mark: "late", left: 6 }).text).toBe("<b>Marked late in Physics 1</b>\n🟡 Late · Practice 15\n6 absences left in this course");
    expect(m.markedAbsent({ course: "Physics 1", lesson: "Practice 16", left: 0, status: "over" }).text).toBe("<b>Marked absent in Physics 1</b>\n🔴 Absent · Practice 16\n⚠️ Over the absence limit in this course");
    expect(m.newGrade({ grade: 86, course: "Physics 1", item: "midterm", average: 86 }).text).toBe("<b>New grade in Physics 1</b>\n🟢 Midterm: 86\nAverage now 86");
    expect(m.newGrade({ grade: 58, course: "Physics 1", item: "Final grade", max: 100 }).text).toBe("<b>New grade in Physics 1</b>\n🔴 Final grade: 58 / 100");
    expect(m.newGrade({ grade: 7, course: "Calculus 1", item: "Quiz 5" }).text).toBe("<b>New grade in Calculus 1</b>\n🟡 Quiz 5: 7");
    expect(m.newFiles({ course: "Calculus 1", courseCode: "MATH111", week: 8, files: ["Midterm review slides", "Mock midterm with answers"] }).text)
      .toBe("<b>2 new files in Calculus 1</b>\nWeek 8\n• Midterm review slides\n• Mock midterm with answers");
    expect(m.newFiles({ course: "Deep Learning", courseCode: "CS401", files: [{ title: "Backpropagation", type: "lecture" }, "Lab 3", "Lab 3", "Syllabus", "Quiz 1", "Quiz 2"] }).text)
      .toBe("<b>6 new files in Deep Learning</b>\n• Backpropagation · Lecture\n• Lab 3\n• Syllabus\nand 2 more");
    expect(m.announcement({ title: "Quiz 6 opens tomorrow at 09:00", course: "Calculus 1", teacher: "Gonçalo Pinto", needsAck: true }).text)
      .toBe("<b>LMS · Quiz 6 opens tomorrow at 09:00</b>\nCalculus 1 · Gonçalo Pinto asks to confirm you've read it");
    expect(m.deadline({ title: "Assignment 3", course: "Software Project Management", due: "23:59", hoursLeft: 3, submitted: false }).text)
      .toBe("<b>Due in 3 hours: Assignment 3</b>\nSoftware Project Management · 23:59 · not submitted yet");
    expect(button(m.classStarted({ course: "Physics 1" }))).toEqual({ text: "Scan QR", web_app: { url: "https://pressf.test/qr" } });
    expect(m.roomChange({ when: "tomorrow", course: "Physics 1", room: "A-108", time: "13:00" }).text).toBe("<b>Room change for tomorrow</b>\nPhysics 1 moved to A-108 at 13:00");
  });
  it("words the semester alerts as designed (9.3)", () => {
    expect(m.semesterStarts({ term: "Spring 2027", date: "Monday 9 Feb", courses: 5, firstClass: "Mon 10:00" }).text)
      .toBe("<b>Spring 2027 starts on Monday 9 Feb</b>\nYour timetable is ready — 5 courses, first class Mon 10:00");
    expect(m.absencesLeft({ left: 2, course: "Physics 1", used: 13, limit: 15 }).text).toBe("<b>Careful: 2 absences left in Physics 1</b>\n⚠️ 13 of 15 absences used");
    expect(m.examTomorrow({ course: "Calculus 1", courseCode: "MATH111", exam: "midterm", time: "10:00", room: "B-204", pastPapers: 3, mocks: 1 }).text)
      .toBe("<b>Calculus 1 midterm tomorrow, 10:00</b>\nB-204 · 3 past papers and a mock in Press F");
    expect(m.termDone({ term: "Fall 2026", gpa: "3.66", overall: "3.62", ects: 198 }).text).toBe("<b>Fall 2026 is done</b>\nSemester GPA 3.66 · overall 3.62 · 198 ECTS");
    expect(m.rateAsk({ term: "Fall 2026", courses: 4 }).text).toBe("<b>Rate Fall 2026 — 4 courses</b>\n30 seconds each, anonymous. Next year's students choose by this.");
    expect(button(m.addDropCloses({ when: "tomorrow 23:59", term: "Spring 2027" })).url).toBe(m.LMS_WEB_URL);
    expect(m.syncStopped().text).toBe("<b>Sync stopped</b>\nYour LMS password changed. Sign in again to keep grades and files coming.");
  });
  it("escapes what comes from the LMS", () => {
    expect(m.newGrade({ grade: 1, course: "<b>x</b>", item: "a&b" }).text).toBe("<b>New grade in &lt;b&gt;x&lt;/b&gt;</b>\n🔴 A&amp;b: 1");
  });
});
