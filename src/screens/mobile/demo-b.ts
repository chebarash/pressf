/**
 * Demo view models in the real view shapes, used only outside production with
 * `?demo=<state>` so every Figma state can be rendered and compared without a
 * synced LMS account. Never used for real visitors.
 */
import type { FileType } from "@/core/files";
import type { SchedulePage } from "@/server/views";
import type { CourseView, FileItem, FileView, MyCoursesView, NextSemesterView, RateQueueView, UploadsView } from "./views";

const sync = { syncedAt: "2026-11-02T04:00:00.000Z", stale: false, lmsDown: false, signInAgain: false };

const file = (id: string, title: string, type: FileType, week: number | null, dateLabel: string, from = "LMS"): FileItem => ({
  id, source: from === "LMS" ? "lms" : "students", title, type, typeLabel: type, format: "pdf", formatCode: "PDF", week,
  date: "2026-11-02T05:00:00.000Z", dateLabel, from, lessonId: null, size: 1_200_000, href: `/f/${id}`,
});

/** Timetable demo (3.1–3.7): five weeks around Monday 2 Nov 2026 of a weekly pattern, in the page's shape. */
export function timetableDemo(demo: string): SchedulePage {
  const day = demo === "free" ? "2026-11-06" : demo === "holiday" ? "2026-12-08" : "2026-11-02";
  const running = demo === "running";
  const pattern: Array<[number, string, string, string, string, string, string]> = [
    [0, "10:00", "11:20", "Calculus 1", "MATH111", "Gonçalo Pinto", "B-204"],
    [0, "13:00", "14:20", "Physics 1", "PHYS101", "Emily Carter", "A-108"],
    [0, "15:00", "16:20", "Computer Science 1", "CS100", "William Rodriguez", "C-112"],
    [2, "10:00", "11:20", "Calculus 1", "MATH111", "Gonçalo Pinto", "B-204"],
    [3, "13:00", "14:20", "Physics 1", "PHYS101", "Emily Carter", "A-108"],
  ];
  const codes = ["CS100", "MATH111", "PHYS101"];
  const monday = day === "2026-12-08" ? "2026-12-07" : "2026-11-02";
  const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const month = (d: string) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const weeks = [-2, -1, 0, 1, 2].map((w) => {
    const mon = add(monday, w * 7);
    return {
      monday: mon, label: w === 0 ? "Week 8, midterm exams" : null, note: null, events: [],
      days: Array.from({ length: 7 }, (_, i) => {
        const d = add(mon, i);
        const off = i === 6 ? "Weekend" : demo === "holiday" && d === "2026-12-08" ? "Holiday · Constitution Day" : null;
        const classes = off || (demo === "free" && d === day) ? [] : pattern.filter((p) => p[0] === i).map(([, time, endTime, name, code, teacher, room], n) => {
          const first = d === monday && n === 0;
          return {
            key: `${code}@${d}T${time}`, courseId: code, code, name, kind: "lecture" as const, start: `${d}T${time}:00+05:00`, end: `${d}T${endTime}:00+05:00`, time, endTime, room,
            teacher: { id: teacher, name: teacher }, changedFrom: demo === "room" && code === "PHYS101" && d === monday ? "B-110" : null, lessonIds: [],
            status: (d < monday ? "done" : d > monday ? "later" : first ? (running ? "now" : "next") : "later") as "done" | "now" | "next" | "later",
            day: d, from: Number(time.slice(0, 2)) * 60 + Number(time.slice(3)), to: Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3)), tone: codes.indexOf(code),
            lesson: {
              lessonId: null, title: first ? "Lecture 15" : null, description: null, syllabus: first ? "Week 8 · Derivatives" : null, type: "Lecture",
              attendance: d < "2026-11-02" ? { mark: "present" as const, label: "Present", viaQr: false } : { mark: "upcoming" as const, label: "Not marked yet", viaQr: false },
              grade: null, homework: [],
              files: first ? [file("l15", "Lecture 15 slides", "lecture", 8, "2 Nov"), file("pp", "Practice problems", "notes", 8, "2 Nov")] : [],
              absences: code === "MATH111" ? { missed: 9, left: 6, limit: 15, status: "ok" as never, line: "" } : null, lmsHref: null,
            },
          };
        });
        return { day: d, weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i], date: `${Number(d.slice(8))} ${month(d)}`, off, classes };
      }),
    };
  });
  return { view: "week", day, today: "2026-11-02", weeks, coming: [], subscribe: { google: "#", personal: false }, feed: null, signedIn: true, sync: null };
}

export function coursesDemo(demo: string): MyCoursesView {
  const card = (code: string, name: string, pct: number, teacher: string, when: string) => ({ courseId: code, code, name, recommendPct: pct, teacher: { id: teacher, name: teacher }, when, mark: null, href: `/c/${code}` });
  return {
    sync,
    term: demo === "nolms" ? "Spring 2027" : "Fall 2026",
    courses: demo === "nolms" ? [] : [
      card("MATH111", "Calculus 1", 84, "Gonçalo Pinto", "Mon, Wed 10:00 · B-204"),
      card("PHYS101", "Physics 1", 62, "Emily Carter", "Tue, Thu 13:00 · A-108"),
      card("CS100", "Computer Science 1", 86, "William Rodriguez", "Mon 15:00 · C-112"),
      card("ENG101", "Academic English", 80, "Daniel Smith", "Fri 09:00 · D-015"),
    ],
    notInLmsYet: demo === "nolms",
    earlier: [
      { term: "Spring 2026", courses: 5, ects: 30 },
      { term: "Fall 2025", courses: 6, ects: 30 },
      { term: "Spring 2025", courses: 5, ects: 30 },
    ],
    next: { term: "Spring 2027", courses: 5, selection: "9–13 Feb" },
  };
}

export function courseDemo(code: string, demo: string): CourseView {
  const guest = demo === "guest";
  const took = demo === "took";
  const mine = !guest && demo !== "notmine";
  const terms = [
    { courseId: "c26f", courseIds: ["c26f"], semesterId: "26f", term: "Fall 2026", teachers: ["Gonçalo Pinto", "Emily Carter"], current: true },
    { courseId: "c26s", courseIds: ["c26s"], semesterId: "26s", term: "Spring 2026", teachers: ["Emily Carter"], current: false },
    { courseId: "c25f", courseIds: ["c25f"], semesterId: "25f", term: "Fall 2025", teachers: ["Gonçalo Pinto", "Emily Carter"], current: false },
    { courseId: "c24f", courseIds: ["c24f"], semesterId: "24f", term: "Fall 2024", teachers: ["Gonçalo Pinto"], current: false },
  ];
  const term = took ? terms[2] : terms[0];
  const w8 = [file("mrs", "Midterm review slides", "lecture", 8, "2 Nov"), demo === "students" ? file("mx", "Midterm exam, Fall 2025", "exam", 8, "3 Nov", "From students") : file("mm", "Mock midterm with answers", "mock", 8, "3 Nov", "Channel")];
  const items = demo === "nofiles" ? [] : [...w8, file("ps7", "Problem set 7 with answers", "notes", 7, "29 Oct", "From students"), file("mock7", "Mock midterm", "mock", 7, "30 Oct", "Channel"), file("ls6", "Lecture slides", "lecture", 6, "14 Oct"), file("syl", "Syllabus", "syllabus", null, "1 Sep")];
  const topics: Record<number, string> = { 6: "Integration by parts", 7: "Indeterminate forms and L'Hôpital's rule", 8: "Midterm exams", 9: "Antiderivatives; Areas and distances." };
  const signedIn = !guest;
  return {
    code, name: "Calculus 1", courseId: term.courseId, term, terms, termStatus: took ? "took" : "now", signedIn,
    ratings:
      demo === "few"
        ? { enough: false, count: 3, hoursLabel: null, difficultyLabel: null, since: null, until: null }
        : {
            enough: true, count: 63, recommendPct: 84, hours: 6, difficulty: 3.4,
            tags: [{ tag: "Exam follows lectures", pct: 71 }, { tag: "Useful later", pct: 58 }, { tag: "Strict attendance", pct: 44 }],
            trend: [{ term: "Fall 2024", value: 71, count: 12 }, { term: "Spring 2025", value: 76, count: 10 }, { term: "Fall 2025", value: 80, count: 14 }, { term: "Spring 2026", value: 78, count: 11 }, { term: "Fall 2026", value: 84, count: 16 }],
            delta: 13, hoursLabel: "≈ 6 h/wk", difficultyLabel: "Hard-ish", since: "Fall 2024", until: "Fall 2026",
          },
    teachers: [
      { id: "t1", name: "Gonçalo Pinto", role: "lecture", roleLabel: "Lectures", pressFPct: 84, ratings: 40, when: "Mon, Wed 10:00", topTag: "Explains clearly", href: "/p/t1" },
      { id: "t2", name: "Emily Carter", role: "tutorial", roleLabel: "Tutorials", pressFPct: 80, ratings: 30, when: "Tue, Thu 13:00", topTag: "Explains clearly", href: "/p/t2" },
      { id: "t5", name: "Sardor Karimov", role: "lab", roleLabel: "Labs", pressFPct: 72, ratings: 20, when: "Fri, 14:00", topTag: "Explains clearly", href: "/p/t5" },
    ],
    anonymous: { count: 23, latest: [{ id: 1, url: "https://t.me/newuu_anonymous/1", text: "Is Calculus 1 harder with the morning section or is it the same exam for everyone?", date: "2026-03-12T10:00:00.000Z" }] },
    weeks: signedIn ? Array.from({ length: 16 }, (_, i) => i + 1).map((w) => ({ week: w, topic: demo === "nofiles" ? null : topics[w] ?? null, current: !took && w === 8, files: items.filter((f) => f.week === w) })) : null,
    totalWeeks: 16,
    teachingWeek: 8,
    files: signedIn ? { all: items.length, byType: {}, items } : null,
    syllabus: signedIn
      ? {
          grading: [{ name: "Final Exam", weight: 40, timing: null }, { name: "Midterm Exam", weight: 30, timing: null }, { name: "Assignments", weight: 30, timing: "One quiz every week except week 7" }],
          ects: 6, totalHours: 180, hoursPerWeek: 12,
          outcomes: ["Compute limits and derivatives", "Apply L'Hôpital's rule", "Integrate by substitution and by parts", "Find areas between curves"],
          books: [{ title: "Calculus: Early Transcendentals", authors: "James Stewart", kind: "required" }, { title: "Thomas' Calculus", authors: "Weir, Hass", kind: "recommended" }],
          prerequisites: { status: "listed", needs: [{ text: "Precalculus", code: "MATH100" }], unlocks: [{ code: "MATH211", name: "Calculus 2" }] },
          description: null, attendancePolicy: null,
        }
      : null,
    you: !mine ? null : took
      ? { status: "took", courseId: "c25f", term: "Fall 2025", mark: 86, passed: true, ects: 6, teacher: "Gonçalo Pinto" }
      : { status: "now", courseId: "c26f", mark: null, average: 74, rating: 51, absences: { missed: 9, left: 6, limit: 15, status: "ok" as never, line: "" }, next: { id: "q6", course: "Calculus 1", title: "Quiz 6", due: "", dueLabel: "tomorrow 09:00", until: "", status: "open" as never, statusLabel: "", grade: null } },
    rate: mine ? { canRate: true, rated: false, term: term.term, href: `/rate/${term.courseId}` } : null,
  };
}

export function fileDemo(id: string): FileView {
  return {
    locked: false, id, source: "lms", title: "Midterm review slides", course: { code: "MATH111", name: "Calculus 1" }, week: 8, type: "lecture", typeLabel: "Lecture",
    format: "pdf", formatCode: "PDF", from: "LMS", date: "2026-11-02T05:00:00.000Z", dateLabel: "2 Nov", size: 2_400_000, mimeType: "application/pdf", downloadName: "Midterm review slides — Calculus 1.pdf", url: null,
  };
}

export function rateDemo(): RateQueueView {
  const t = (id: string, name: string, role: "lecture" | "tutorial" | "lab", roleLabel: string) => ({ id, name, role, roleLabel });
  const waiting = [
    { courseId: "DM101", code: "DM101", name: "Discrete Mathematics", term: "Spring 2026", teachers: [t("t5", "Sardor Karimov", "lecture", "Lectures"), t("t4", "Daniel Smith", "tutorial", "Tutorials")], href: "/rate/DM101?demo=on" },
    { courseId: "CS102", code: "CS102", name: "Programming 2", term: "Spring 2026", teachers: [t("t2", "Emily Carter", "lecture", "Lectures")], href: "/rate/CS102?demo=on" },
    { courseId: "c26f", code: "MATH111", name: "Calculus 1", term: "Fall 2026", teachers: [t("t1", "Gonçalo Pinto", "lecture", "Lectures"), t("t2", "Emily Carter", "tutorial", "Tutorials"), t("t5", "Sardor Karimov", "lab", "Labs")], href: "/rate/c26f?demo=on" },
  ];
  const rated = [
    { ...waiting[2], courseId: "MATH110", name: "Calculus 1", term: "Fall 2025", recommend: "yes" as const, pressedF: [], updatedAt: "", updatedLabel: "3 Mar", canEdit: true },
    { ...waiting[1], courseId: "PHYS100", name: "Physics 1", term: "Fall 2025", recommend: "yes" as const, pressedF: [], updatedAt: "", updatedLabel: "11 Feb", canEdit: true },
  ];
  return { currentTerm: "Fall 2026", waiting: waiting.slice(0, 2), rated: [...rated, { ...rated[1], courseId: "c26f", code: "MATH111", name: "Calculus 1", term: "Fall 2026", teachers: waiting[2].teachers, href: "/rate/c26f?demo=on" }], total: 8, ask: { level: "card", term: "Spring 2026", waiting: waiting.slice(0, 2) } };
}

export function nextDemo(): NextSemesterView {
  const cohort = (teacherId: string, name: string, when: string, room: string, pressFPct: number) => ({ teacherId, name, when, room, pressFPct });
  const summary = (hours: number, word: string) => ({ enough: true as const, count: 20, recommendPct: 80, hours, difficulty: 3, tags: [], trend: [], delta: null, hoursLabel: `≈ ${hours} h/wk`, difficultyLabel: word, since: null, until: null });
  return {
    term: "Spring 2027", ects: 30, missing: false,
    phases: [{ title: "Cohort selection", starts: "", ends: "", label: "9–13 Feb", kind: "cohort-selection" as const }, { title: "Classes start", starts: "", ends: "", label: "16 Feb" }, { title: "Add/drop", starts: "", ends: "", label: "16–27 Feb", kind: "add-drop" as const }],
    courses: [
      { courseId: "m2", code: "MATH211", name: "Calculus 2", ects: 6, ratings: summary(7, "Hard"), recommendPct: 78, cohorts: [cohort("t1", "Gonçalo Pinto", "Mon, Wed 10:00", "B-204", 88), cohort("t2", "Emily Carter", "Tue, Thu 15:00", "A-108", 80)], prerequisites: [{ text: "Calculus 1", code: "MATH111", status: "passed" }], href: "/c/MATH211" },
      { courseId: "ds", code: "CS200", name: "Data Structures", ects: 6, ratings: summary(8, "Hard"), recommendPct: 88, cohorts: [cohort("t3", "William Rodriguez", "Mon 15:00", "C-112", 90), cohort("t3", "William Rodriguez", "Wed 15:00", "C-112", 90), cohort("t2", "Emily Carter", "Fri 10:00", "C-110", 70)], prerequisites: [{ text: "CS 1", code: "CS100", status: "passed" }], href: "/c/CS200" },
      { courseId: "p2", code: "PHYS102", name: "Physics 2", ects: 6, ratings: summary(6, "Medium"), recommendPct: 64, cohorts: [cohort("t2", "Emily Carter", "Tue, Thu 13:00", "A-108", 80)], prerequisites: [{ text: "Physics 1", code: "PHYS101", status: "in-progress" }], href: "/c/PHYS102" },
      { courseId: "ec", code: "ECON101", name: "Microeconomics", ects: 6, ratings: summary(4, "Easy"), recommendPct: 81, cohorts: [], prerequisites: [], href: "/c/ECON101" },
    ],
  };
}

export function uploadsDemo(): UploadsView {
  const u = (id: string, title: string, status: "waiting" | "live" | "rejected", opens: number, reason: string | null = null) => ({ id, title, course: "Calculus 1", status, reason, opens, date: "", dateLabel: "", href: status === "live" ? `/f/${id}` : null });
  const items = [u("u1", "Midterm exam, Fall 2025", "waiting", 0), u("u2", "Mock midterm with answers", "live", 2310), u("u3", "Quiz 2 solutions", "live", 740), u("u4", "Physics 1 notes", "rejected", 0, "Already in LMS, Weeks 1–4")];
  return { items, live: 2, opens: 3050 };
}
