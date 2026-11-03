import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => ({ scheduleRefresh: vi.fn() }));
vi.mock("@/server/sync/refresh", () => refresh);

import { db } from "@/lib/db";
import { lmsAccounts, mentionLinks, mentions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ingest } from "@/server/feed";
import { saveRating } from "@/server/ratings";
import * as views from "@/server/views";
import { resetDb } from "../fixtures/db";
import { NOW, seedStudent, seedUpload, snapshot } from "../fixtures/student";

let userId: string;

beforeEach(async () => {
  await resetDb();
  refresh.scheduleRefresh.mockReset();
  userId = await seedStudent();
});

const rateMany = async (n: number, recommend: "yes" | "no" = "yes") => {
  for (let i = 0; i < n; i++) {
    const [u] = await db().insert(users).values({ email: `r${i}-${recommend}@newuu.uz` }).returning();
    await saveRating(u.id, { id: "90", code: "MATH111" }, "Fall 2025", { recommend, hours: "5-10", difficulty: 4, tags: ["Useful later"], teachers: [{ teacherId: "T1", role: "lecture", pressF: true, tags: ["Explains clearly"] }] });
  }
};

describe("today", () => {
  it("builds the day from the sync snapshot without calling the LMS", async () => {
    await ingest(userId, [{ id: "lms:1", kind: "announcement", title: "Quiz 6 opens tomorrow at 09:00", courseId: "101", at: new Date(NOW.getTime() - 3600_000), read: false, needsAck: true }]);
    const t = (await views.today(userId, NOW))!;
    expect(t.state).toBe("running");
    expect(t.current).toMatchObject({ name: "Calculus 1", time: "10:00", endTime: "11:20", room: "B-204", teacher: { id: "T1", name: "Gonçalo Pinto" } });
    expect(t.tiles).toMatchObject({ qrOpen: true, courses: 2, absences: { left: 2, name: "Physics 1" } });
    expect(t.materials.map((f) => f.title)).toEqual(["Midterm review slides"]);
    expect(t.notifications).toMatchObject({ unread: 1, items: [{ title: "Quiz 6 opens tomorrow at 09:00", courseName: "Calculus 1", needsAck: true }] });
    expect(t.dueSoon[0]).toMatchObject({ title: "Lab 6 report", statusLabel: "In progress" });
    expect(t.courses[0]).toMatchObject({ code: "MATH111", recommendPct: null, when: "Mon, Wed 10:00 · B-204", teacher: { name: "Gonçalo Pinto" } });
    expect(t.banner).toMatchObject({ kind: "absences", text: "2 absences left in Physics 1." });
    expect(t.rating).toMatchObject({ level: "shine", term: "Fall 2025" });
    expect(t.rating.waiting[0]).toMatchObject({ name: "Calculus 1", teachers: [{ name: "Gonçalo Pinto", roleLabel: "Lectures" }] });
  });

  it("falls back to the weekly pattern outside the synced window", async () => {
    const tue = new Date("2026-11-03T06:00:00Z");
    const t = (await views.timetable(userId, "2026-11-03", tue))!;
    expect(t.classes.map((c) => [c.name, c.time, c.room])).toEqual([["Physics 1", "13:00", "A-108"]]);
    expect(t.week.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("asks to sign in again and schedules no refresh for a dead login", async () => {
    await db().update(lmsAccounts).set({ status: "invalid" }).where(eq(lmsAccounts.userId, userId));
    const t = (await views.today(userId, NOW))!;
    expect(t.banner?.kind).toBe("sign-in");
    expect(refresh.scheduleRefresh).not.toHaveBeenCalled();
  });

  it("shows the LMS-down banner with the last good time", async () => {
    await resetDb();
    userId = await seedStudent({ snapshot: snapshot({ error: "LMS 502" }) });
    expect((await views.today(userId, NOW))!.banner).toMatchObject({ kind: "lms-down", action: { label: "Retry" } });
  });
});

describe("course", () => {
  it("gives guests ratings and teachers but no files, syllabus or personal data", async () => {
    await seedUpload();
    const c = (await views.course("math111", null, null, NOW))!;
    expect(c).toMatchObject({ code: "MATH111", name: "Calculus 1", signedIn: false, files: null, weeks: null, syllabus: null, you: null });
    expect(c.ratings).toEqual(expect.objectContaining({ enough: false, count: 0 }));
    expect(c.teachers.map((t) => t.name)).toEqual(["Gonçalo Pinto"]);
  });

  it("shows files by week with student uploads and you in this course", async () => {
    await seedUpload();
    const c = (await views.course("MATH111", null, { userId }, NOW))!;
    expect(c.courseId).toBe("101");
    expect(c.termStatus).toBe("now");
    expect(c.files?.all).toBe(2);
    const week8 = c.weeks!.find((w) => w.week === 8)!;
    expect(week8.files.map((f) => [f.title, f.from])).toEqual([["Midterm review slides", "LMS"], ["Mock midterm with answers", "From students"]]);
    expect(c.you).toMatchObject({ status: "now", average: 74, absences: { missed: 9, left: 6, limit: 15 } });
  });

  it("shows ratings from five students and the result of a past semester", async () => {
    await rateMany(5);
    const c = (await views.course("MATH111", "6", { userId }, NOW))!;
    expect(c.ratings).toMatchObject({ enough: true, count: 5, recommendPct: 100, hoursLabel: "≈ 8 h/wk", difficultyLabel: "Hard" });
    expect(c.termStatus).toBe("took");
    expect(c.you).toMatchObject({ status: "took", mark: 86, passed: true, ects: 6 });
    expect(c.teachers[0]).toMatchObject({ pressFPct: 100, roleLabel: "Lectures" });
  });

  it("locks files for guests", async () => {
    expect(await views.file("F1", null)).toMatchObject({ locked: true, course: { code: "MATH111" } });
    expect(await views.file("F1", { userId })).toMatchObject({ locked: false, title: "Midterm review slides", week: 8, from: "LMS", downloadName: "Midterm review slides — Calculus 1.pdf" });
    expect(await views.file("nope", { userId })).toBeNull();
  });

  it("downloads go through the branded route with a signed link (no cookie needed, e.g. Telegram's downloader)", async () => {
    const { downloadAllowed } = await import("@/server/covers/source");
    const v = await views.file("F1", { userId });
    const link = new URL((v as { downloadUrl: string }).downloadUrl, "https://x");
    expect(link.pathname).toBe("/f/F1/download");
    expect(downloadAllowed("F1", link.searchParams.get("exp"), link.searchParams.get("sig"))).toBe(true);
    expect(downloadAllowed("F2", link.searchParams.get("exp"), link.searchParams.get("sig"))).toBe(false);
    expect(downloadAllowed("F1", link.searchParams.get("exp"), "forged")).toBe(false);
    expect(downloadAllowed("F1", link.searchParams.get("exp"), link.searchParams.get("sig"), new Date(Date.now() + 2 * 3600_000))).toBe(false);
  });
});

describe("professor and search", () => {
  it("shows a professor with courses, times and mentions", async () => {
    await db().insert(mentions).values({ postId: 7, url: "https://t.me/x/7", text: "Which Calculus section?" });
    await db().insert(mentionLinks).values({ postId: 7, kind: "teacher", target: "T1" });
    const p = (await views.professor("T1", null))!;
    expect(p).toMatchObject({ name: "Gonçalo Pinto", position: "Senior lecturer", signedIn: false, anonymous: { count: 1 } });
    expect(p.courses).toEqual([expect.objectContaining({ code: "MATH111", roleLabel: "lectures" })]);
    expect(p.when).toEqual([expect.objectContaining({ day: "Mon", time: "10:00", room: "B-204" })]);
    expect(await views.professor("missing", null)).toBeNull();
  });

  it("finds courses and people, and files only when signed in", async () => {
    const guest = await views.search("calc", null);
    expect(guest.courses).toEqual([expect.objectContaining({ code: "MATH111", name: "Calculus 1" })]);
    expect(guest.files).toEqual([]);
    expect((await views.search("midterm", { userId })).files[0]).toMatchObject({ title: "Midterm review slides", course: "Calculus 1" });
    expect((await views.search("pinto", null)).people[0].name).toBe("Gonçalo Pinto");
    expect((await views.search("quantum", null)).nothing).toBe(true);
  });
});

describe("progress, notifications, calendar, profile", () => {
  it("shows progress per course and class by class", async () => {
    const p = (await views.progress(userId, NOW))!;
    expect(p).toMatchObject({ gpa: 3.62, ectsEarned: 168, currentTerm: "Fall 2026", empty: false });
    // The headline is the running rating (the LMS "Rating" column) until the final is in.
    expect(p.courses.map((c) => [c.name, c.mark, c.absences?.left])).toEqual([["Calculus 1", 51, 6], ["Physics 1", 80, 2]]);
    expect(p.courses[1].next?.title).toBe("Lab 6 report");
    const one = (await views.courseProgress(userId, "101", NOW))!;
    expect(one.teacher).toBe("Gonçalo Pinto");
    expect(one.events.map((e) => [e.lesson, e.mark, e.score])).toEqual([["Quiz 5", "present", 7], ["Lecture 14", "absent", null]]);
    const a = (await views.assignments(userId, NOW))!;
    expect(a.dueThisWeek.map((d) => d.title)).toEqual(["Lab 6 report"]);
  });

  it("opens an earlier semester's results from Progress", async () => {
    const p = (await views.progress(userId, NOW))!;
    expect(p.earlier).toEqual([expect.objectContaining({ term: "Fall 2025", href: "/progress/term/fall-2025" })]);
    const t = (await views.termResults(userId, "fall-2025", NOW))!;
    expect(t).toMatchObject({ term: "Fall 2025", overallGpa: 3.62, ectsEarned: 168, ectsTotal: 240, ects: 6, passed: 1, curriculumHref: "/programs/mine/curriculum" });
    expect(t.courses).toEqual([{ courseId: "90", code: "MATH111", name: "Calculus 1", mark: 86, passed: true, fx: false, ects: 6, href: "/progress/90" }]);
    // Calculus 1 (Fall 2025) is not rated yet: the "Rate Fall 2025" card shows.
    expect(t.rate).toEqual({ waiting: 1, href: "/rate" });
    expect((await views.termResults(userId, "Fall%202025", NOW))?.term).toBe("Fall 2025");
    // The running semester and unknown ones are not "earlier".
    expect(await views.termResults(userId, "fall-2026", NOW)).toBeNull();
    expect(await views.termResults(userId, "spring-1999", NOW)).toBeNull();
    // Rated: the card goes away.
    await saveRating(userId, { id: "90", code: "MATH111" }, "Fall 2025", { recommend: "yes", hours: "2-5", difficulty: null, tags: [], teachers: [] });
    expect((await views.termResults(userId, "fall-2025", NOW))!.rate).toBeNull();
  });

  it("filters and sections the feed", async () => {
    await ingest(userId, [
      { id: "g1", kind: "grade", title: "New grade: 86", courseId: "102", at: new Date(NOW.getTime() - 3600_000), read: false },
      { id: "a1", kind: "absence", title: "Marked absent: Physics 1", at: new Date("2026-10-29T10:00:00Z"), read: true },
    ]);
    const n = (await views.notifications(userId, { filter: "grade", open: "a1" }, NOW))!;
    expect(n.unread).toBe(1);
    expect(n.sections).toEqual([{ title: "Today", items: [expect.objectContaining({ id: "g1", courseName: "Physics 1" })] }]);
    expect(n.open?.id).toBe("a1");
    expect(n.filters.find((f) => f.id === "all")?.count).toBe(2);
  });

  it("puts holidays, exams and deadlines on the calendar", async () => {
    const c = await views.calendar({ userId }, undefined, NOW);
    const all = c.days.flatMap((d) => d.events);
    expect(all.find((e) => e.layer === "holidays")).toMatchObject({ title: "Constitution Day", day: "2026-12-08" });
    expect(all.find((e) => e.layer === "deadlines")).toMatchObject({ title: "Lab 6 report", sub: "Deadline · Physics 1 · 23:59" });
    const only = await views.calendar(null, ["holidays"], new Date("2027-04-01T00:00:00Z"));
    expect(only.empty).not.toBeNull();
  });

  it("builds the profile and the rate queue", async () => {
    const p = (await views.profile(userId, NOW))!;
    expect(p).toMatchObject({ name: "Shamsiddin Abdurakhimov", shortName: "Shamsiddin A.", telegramLinked: true, ratings: { count: 0, waiting: 1 }, year: 4 });
    await saveRating(userId, { id: "90", code: "MATH111" }, "Fall 2025", { recommend: "yes", hours: null, difficulty: null, tags: [], teachers: [{ teacherId: "T1", role: "lecture", pressF: true, tags: [] }] });
    const q = (await views.rateQueue(userId, NOW))!;
    expect(q.waiting).toEqual([]);
    expect(q.rated[0]).toMatchObject({ name: "Calculus 1", recommend: "yes", pressedF: ["Gonçalo Pinto"], canEdit: false });
    expect(q.ask.level).toBe("none");
  });
});
