import type { AttendanceStatus } from "@/core/attendance";
import { lessonLabel, markTier, type MarkTier } from "@/core/feed-marks";
import { TYPE_LABEL, type FileType } from "@/core/files";
import { path, type Target } from "@/core/links";
import type { BotMessage, InlineButton, InlineKeyboard } from "./api";
import { card, esc, tgTime } from "./html";
import { appButton } from "./links";

/**
 * Every message the bot sends, worded as in the design (Figma 9.1–9.5, 11.x).
 * The sync jobs send alerts with these too, so the bot and the alerts read the
 * same: `send(chatId, newGrade({...}))` from ./api.
 */

export type { BotMessage };

/** A button that opens a Press F screen inside Telegram: the main action, so blue. */
export const openButton = (label: string, target: Target): InlineButton => ({ ...appButton(label, path(target)), style: "primary" });

const one = (button: InlineButton): InlineKeyboard => ({ inline_keyboard: [[button]] });
const open = (label: string, target: Target) => one(openButton(label, target));

export const LMS_WEB_URL = "https://newuzbekistan.hero.study";

/* ───────────── /start and plain chat ───────────── */

/** 9.5 · first /start, and what anyone not signed in to Press F gets. */
export const welcome = (): BotMessage => ({
  text: card(
    "Hi! I'm Press F.",
    "Your NewUU timetable, files, grades and absences in one place — plus what students say about every course. Open the app and sign in with your LMS account. After that I'll message you before classes and when grades land."
  ),
  keyboard: one(appButton("Open Press F")),
});

/** The answer to a startapp-style link opened through the bot. */
export const openPage = (page: Target | string): BotMessage => ({
  text: "Here it is.",
  keyboard: one(typeof page === "string" ? appButton("Open in Press F", page) : openButton("Open in Press F", page)),
});

/* ───────────── sharing a file (11.x) ───────────── */

/** 11.2 · before the file arrives (deep link, or a message without a file). */
export const askForFile = (): BotMessage => ({ text: "Send me the file and I'll ask where it goes." });

/** 11.5 · after Send for review. */
export const sentForReview = (): BotMessage => ({ text: card("Sent for review ✓", "A moderator checks it, usually within a day.") });

/** 11.5 · the file is live (trusted uploaders at once, others after review). */
export const fileLive = (title: string, courseName: string, courseCode?: string | null): BotMessage => ({
  text: card("Your file is live 🎉", `${title} · ${courseName} — marked 'From students'. Thanks, it helps the next cohort.`),
  keyboard: courseCode ? open(`Open in ${courseName}`, { to: "course", code: courseCode, tab: "files" }) : undefined,
});

/** 11.5 · the moderator turned it down. */
export const notAccepted = (title: string, reason: string): BotMessage => ({
  text: card(`Not accepted: ${title}`, `Reason: ${reason}`),
  keyboard: one({ text: "Got it", callback_data: "ok" }),
});

/**
 * Formats a free-form message from the admin (src/server/uploads publish/reject):
 * first line bold, the rest plain. The live message gets the course button.
 */
export function reviewOutcome(message: string, live: { courseName: string; courseCode?: string | null } | null): BotMessage {
  const [title, ...rest] = message.trim().split("\n");
  if (live?.courseCode) return { text: card(title, ...rest), keyboard: open(`Open in ${live.courseName}`, { to: "course", code: live.courseCode, tab: "files" }) };
  return { text: card(title, ...rest), keyboard: live ? undefined : one({ text: "Got it", callback_data: "ok" }) };
}

export const alreadyShared = (courseName: string): BotMessage => ({
  text: card("Already on Press F ✓", `Someone shared this exact file in ${courseName} before. Thanks anyway!`),
});

export const sharingPaused = (): BotMessage => ({
  text: card("Sharing is paused", "A moderator paused uploads from your account for now. You can still use everything else in Press F."),
});

export const uploadFailed = (): BotMessage => ({ text: card("That didn't work", "Telegram didn't give me the file. Please send it again.") });
export const tooBig = (): BotMessage => ({ text: card("That file is too big", "Telegram lets a bot read files up to 20 MB. Send a smaller copy or split it.") });
export const slowDown = (): BotMessage => ({ text: card("That's a lot of files", "Please send the rest in an hour.") });
export const notAFile = (): BotMessage => ({ text: "Send a document, photo, video or audio file and I'll ask where it goes." });
export const cancelled = (): BotMessage => ({ text: "Cancelled. Send a file any time." });
export const expired = (): BotMessage => ({ text: "That one timed out. Send the file again." });
export const askCourseName = (): BotMessage => ({ text: card("Which course?", "Type its name or code, like Calculus 1 or MATH111.") });
export const noCourseFound = (query: string): BotMessage => ({ text: card(`Nothing called “${query}”`, "Try another name or the course code.") });

/* ───────────── alerts: every day (9.2) ───────────── */

export type DigestClass = {
  time: string;
  course: string;
  room?: string | null;
  /** The teacher's lesson title or the syllabus topic of the week ("Week 10 · Integration testing"). */
  topic?: string | null;
  /** Syllabus quizzes and deadlines on this class ("Quiz 2 · 10% · likely today"). */
  marks?: string[];
};

/**
 * 07:30 · morning digest, school days only. The rich version is a table of
 * the classes, then a collapsed block per class with its topic and quizzes.
 */
export function morningDigest(a: { classes: DigestClass[]; due?: string | null }): BotMessage {
  const n = a.classes.length;
  const title = `Today: ${n} ${n === 1 ? "class" : "classes"}`;
  const lines = a.classes.map((c) => [`${c.time} ${c.course}`, c.room].filter(Boolean).join(" · "));
  const rows = a.classes.map((c) => `<tr><td>${esc(c.time)}</td><td>${esc(c.course)}</td><td>${esc(c.room ?? "")}</td></tr>`).join("");
  const details = a.classes
    .filter((c) => c.topic || c.marks?.length)
    .map((c) => `<blockquote expandable><b>${esc(c.course)}</b>${[c.topic, ...(c.marks ?? []).map((m) => `🟡 ${m}`)].filter(Boolean).map((l) => `<br/>${esc(l!)}`).join("")}</blockquote>`)
    .join("");
  const rich = `<p><b>${esc(title)}</b></p><table compact>${rows}</table>${details}${a.due ? `<p>Due tonight: ${esc(a.due)}</p>` : ""}`;
  return { text: card(title, ...lines, a.due && `Due tonight: ${a.due}`), rich, keyboard: open("Open Today", { to: "today" }) };
}

/** 15 min before each class; with `start`, "in 15 minutes" counts down in the chat. */
export const classSoon = (a: { course: string; courseCode?: string; room?: string | null; teacher?: string | null; note?: string | null; minutes?: number; start?: Date }): BotMessage => {
  const inMinutes = `in ${a.minutes ?? 15} minutes`;
  const line = esc([a.room, a.teacher, a.note].filter(Boolean).join(" · "));
  return {
    text: `<b>${esc(a.course)} ${a.start ? tgTime(a.start, "r", inMinutes) : inMinutes}</b>${line ? `\n${line}` : ""}`,
    keyboard: open("Open class", a.courseCode ? { to: "course", code: a.courseCode } : { to: "timetable" }),
  };
};

/** 5 min after a class starts, if not checked in. */
export const classStarted = (a: { course: string }): BotMessage => ({
  text: card(`${a.course} has started`, "Scan the QR on the screen to check in"),
  keyboard: open("Scan QR", { to: "qr" }),
});

/** Telegram's 🎉 message effect. */
const CONFETTI = "5046509860389126442";

/** The app's colours in a chat: tier of a grade, mark of a class. */
const TIER_DOT: Record<MarkTier, string> = { high: "🟢", mid: "🟡", low: "🔴" };
const MARK_DOT = { absent: "🔴", late: "🟡" } as const;

const absencesLeftLine = (left: number | null | undefined, status?: AttendanceStatus | null) => {
  if (status === "over") return "⚠️ Over the absence limit in this course";
  if (left == null) return null;
  if (left === 0 || status === "last") return "⚠️ No absences left in this course";
  const line = `${left} ${left === 1 ? "absence" : "absences"} left in this course`;
  return left <= 2 || status === "low" ? `⚠️ ${line}` : line;
};

/**
 * When the LMS marks an absence (or a late arrival): the course, the class
 * with its mark and when it was ("🔴 Absent · Lecture 7 · Mon 3 Nov 13:30"),
 * then the absences left, flagged when few or none are left.
 */
export const markedAbsent = (a: { course: string; courseId?: string; lesson: string; when?: string | null; mark?: "absent" | "late"; left?: number | null; status?: AttendanceStatus | null }): BotMessage => {
  const mark = a.mark ?? "absent";
  return {
    text: card(`Marked ${mark} in ${a.course}`, [`${MARK_DOT[mark]} ${mark === "late" ? "Late" : "Absent"}`, lessonLabel(a.lesson), a.when].filter(Boolean).join(" · "), absencesLeftLine(a.left, a.status)),
    keyboard: open("See progress", { to: "progress", courseId: a.courseId }),
  };
};

/**
 * When a grade appears: the course, what was graded with the score in its
 * tier colour and out of what when known ("🟢 Midterm: 87 / 100"), then the
 * course average.
 */
export const newGrade = (a: { grade: number | string; course: string; courseId?: string; item: string; max?: number | null; average?: number | string | null }): BotMessage => {
  const score = Number(a.grade);
  const dot = Number.isFinite(score) ? `${TIER_DOT[markTier(score, a.max ?? null)]} ` : "";
  const what = a.item.trim() ? `${a.item.trim()[0].toUpperCase()}${a.item.trim().slice(1)}: ` : "";
  const high = Number.isFinite(score) && markTier(score, a.max ?? null) === "high";
  const label = a.item.trim() ? `${a.item.trim()[0].toUpperCase()}${a.item.trim().slice(1)}` : "Grade";
  const rows = [[label, `${dot}${a.grade}${a.max ? ` / ${a.max}` : ""}`], ...(a.average != null ? [["Average now", String(a.average)]] : [])];
  return {
    text: card(`New grade in ${a.course}`, `${dot}${what}${a.grade}${a.max ? ` / ${a.max}` : ""}`, a.average != null && `Average now ${a.average}`),
    rich: `<p><b>${esc(`New grade in ${a.course}`)}</b></p><table compact>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>`,
    // 🎉 on a high mark.
    effect: high ? CONFETTI : undefined,
    keyboard: open("See progress", { to: "progress", courseId: a.courseId }),
  };
};

/**
 * When files appear (bundled per course, at most once an hour): the count and
 * course, the week, then the files as a short list (at most three, each once,
 * with its type when known) and "and N more".
 */
export const newFiles = (a: { course: string; courseCode: string; files: Array<string | { title: string; type?: FileType | null }>; week?: number | null }): BotMessage => {
  const n = a.files.length;
  const seen = new Set<string>();
  const unique = a.files
    .map((f) => (typeof f === "string" ? { title: f.trim(), type: null } : { title: f.title.trim(), type: f.type ?? null }))
    .filter((f) => f.title && !seen.has(f.title) && seen.add(f.title));
  const shown = unique.slice(0, 3).map((f) => `• ${f.title}${f.type && f.type !== "other" ? ` · ${TYPE_LABEL[f.type]}` : ""}`);
  const more = unique.length - Math.min(unique.length, 3);
  return {
    text: card(`${n} new ${n === 1 ? "file" : "files"} in ${a.course}`, a.week ? `Week ${a.week}` : null, ...shown, more > 0 && `and ${more} more`),
    keyboard: open("Open course", { to: "course", code: a.courseCode, tab: "files" }),
  };
};

/** When the LMS posts an announcement. */
export const announcement = (a: { title: string; course: string; teacher?: string | null; needsAck?: boolean; id?: string }): BotMessage => ({
  text: card(`LMS · ${a.title}`, [a.course, a.teacher && (a.needsAck ? `${a.teacher} asks to confirm you've read it` : a.teacher)].filter(Boolean).join(" · ")),
  keyboard: open("Read", { to: "notifications", id: a.id }),
});

/** 48 h and 3 h before a deadline; with `dueAt`, "in 3 hours" keeps counting down in the chat. */
export const deadline = (a: { title: string; course: string; due: string; dueAt?: Date; hoursLeft: number; submitted?: boolean; target?: Target }): BotMessage => {
  const when = a.hoursLeft >= 24 ? `${Math.round(a.hoursLeft / 24)} ${Math.round(a.hoursLeft / 24) === 1 ? "day" : "days"}` : `${a.hoursLeft} ${a.hoursLeft === 1 ? "hour" : "hours"}`;
  const line = esc([a.course, a.due, a.submitted === false && "not submitted yet"].filter(Boolean).join(" · "));
  return {
    text: `<b>Due ${a.dueAt ? tgTime(a.dueAt, "r", `in ${when}`) : `in ${when}`}: ${esc(a.title)}</b>\n${line}`,
    keyboard: open("Open assignment", a.target ?? { to: "timetable", view: "month" }),
  };
};

/** When a room or time changes. */
export const roomChange = (a: { when: string; course: string; room: string; time: string }): BotMessage => ({
  text: card(`Room change for ${a.when}`, `${a.course} moved to ${a.room} at ${a.time}`),
  keyboard: open("Open timetable", { to: "timetable" }),
});

/** Replies on your Anonymous post. */
export const postReplies = (a: { count: number; post: string; target: Target }): BotMessage => ({
  text: card(`${a.count} ${a.count === 1 ? "reply" : "replies"} on your post`, `“${a.post}”`),
  keyboard: open("Open post", a.target),
});

/* ───────────── alerts: semester rhythm (9.3) ───────────── */

/** 2 weeks before classes start. */
export const semesterStarts = (a: { term: string; date: string; courses: number; firstClass: string }): BotMessage => ({
  text: card(`${a.term} starts on ${a.date}`, `Your timetable is ready — ${a.courses} ${a.courses === 1 ? "course" : "courses"}, first class ${a.firstClass}`),
  keyboard: open("See timetable", { to: "timetable" }),
});

/** 3 days before cohort selection opens. */
export const cohortSelection = (a: { when: string; target?: Target }): BotMessage => ({
  text: card(`Cohort selection opens ${a.when}`, "Pick who teaches you next semester. Press F shows how students rate each teacher."),
  keyboard: open("Compare teachers", a.target ?? { to: "courses" }),
});

/** The day before add/drop closes. */
export const addDropCloses = (a: { when: string; term: string; lmsUrl?: string }): BotMessage => ({
  text: card(`Add/drop closes ${a.when}`, `Last chance to change ${a.term} courses in LMS`),
  keyboard: one({ text: "Open LMS", url: a.lmsUrl ?? LMS_WEB_URL }),
});

/** When an absence limit gets close (2 left). */
export const absencesLeft = (a: { left: number; course: string; courseId?: string; used: number; limit: number }): BotMessage => ({
  text: card(`Careful: ${a.left} ${a.left === 1 ? "absence" : "absences"} left in ${a.course}`, `⚠️ ${a.used} of ${a.limit} absences used`),
  keyboard: open("See progress", { to: "progress", courseId: a.courseId }),
});

/** Friday before midterm / final week. */
export const examWeek = (a: { kind: "midterm" | "final"; exams: Array<{ when: string; course: string; room?: string | null }> }): BotMessage => ({
  text: card(a.kind === "midterm" ? "Midterms next week" : "Finals next week", ...a.exams.map((e) => [`${e.when} ${e.course}`, e.room].filter(Boolean).join(" · ")), "Past papers are on each course page"),
  keyboard: open("Exam plan", { to: "next" }),
});

/** Evening before each exam. */
export const examTomorrow = (a: { course: string; courseCode: string; exam: string; time: string; room?: string | null; pastPapers?: number; mocks?: number }): BotMessage => {
  const papers = [
    a.pastPapers ? `${a.pastPapers} past ${a.pastPapers === 1 ? "paper" : "papers"}` : null,
    a.mocks ? (a.mocks === 1 ? "a mock" : `${a.mocks} mocks`) : null,
  ].filter(Boolean).join(" and ");
  return {
    text: card(`${a.course} ${a.exam} tomorrow, ${a.time}`, [a.room, papers && `${papers} in Press F`].filter(Boolean).join(" · ")),
    keyboard: open("Open course", { to: "course", code: a.courseCode, tab: "files" }),
  };
};

/**
 * Evening before a quiz, project… from the course syllabus: "Tomorrow: Quiz 2
 * in Deep Learning (10%, from the syllabus)"; "inferred from the syllabus" when
 * the syllabus gives only the week. `when` is "Tomorrow" or "This week".
 */
export const syllabusMilestone = (a: { when: "Tomorrow" | "This week"; title: string; course: string; courseCode?: string | null; weight?: string | null; inferred: boolean; note?: string | null }): BotMessage => ({
  text: card(syllabusMilestoneTitle(a), a.note),
  keyboard: a.courseCode ? open("Open course", { to: "course", code: a.courseCode }) : open("See timetable", { to: "timetable" }),
});

/** The title line of a syllabus milestone alert, the same in the feed. */
export const syllabusMilestoneTitle = (a: { when: "Tomorrow" | "This week"; title: string; course: string; weight?: string | null; inferred: boolean }) =>
  `${a.when}: ${a.title} in ${a.course} (${[a.weight, a.inferred ? "inferred from the syllabus" : "from the syllabus"].filter(Boolean).join(", ")})`;

/** An hour before an exam. */
export const examSoon = (a: { course: string; exam: string; time: string; room?: string | null }): BotMessage => ({
  text: card(`${a.course} ${a.exam} at ${a.time}`, [a.room, "Good luck"].filter(Boolean).join(" · ")),
  keyboard: open("See timetable", { to: "timetable" }),
});

/** The university sheet moved a student's exam: "Room changed: CS412 Deep Learning". */
export const examChanged = (a: { title: string; now: string; was: string }): BotMessage => ({
  text: card(a.title, `${a.now} (was ${a.was})`),
  keyboard: open("See timetable", { to: "timetable" }),
});

/** When the final exam timetable is published. */
export const finalTimesOut = (a: { exams: number; dates: string }): BotMessage => ({
  text: card("Final exam times are out", `${a.exams} ${a.exams === 1 ? "exam" : "exams"}, ${a.dates} · added to your calendar`),
  keyboard: open("See dates", { to: "timetable", view: "month" }),
});

/** When final grades are in. */
export const termDone = (a: { term: string; gpa: number | string; overall: number | string; ects: number }): BotMessage => ({
  text: card(`${a.term} is done`, `Semester GPA ${a.gpa} · overall ${a.overall} · ${a.ects} ECTS`),
  keyboard: open("See progress", { to: "progress" }),
});

/** After final grades, then every 3 days (at most 3 times). */
export const rateAsk = (a: { term: string; courses: number }): BotMessage => ({
  text: card(`Rate ${a.term} — ${a.courses} ${a.courses === 1 ? "course" : "courses"}`, "30 seconds each, anonymous. Next year's students choose by this."),
  keyboard: open("Rate now", { to: "rate" }),
});

/** Break starts. */
export const breakStarts = (a: { name: string; until: string; note?: string | null }): BotMessage => ({
  text: card(`${a.name} until ${a.until}`, a.note),
  keyboard: open("See dates", { to: "timetable", view: "month" }),
});

/** When the saved LMS password stops working. */
export const syncStopped = (): BotMessage => ({
  text: card("Sync stopped", "Your LMS password changed. Sign in again to keep grades and files coming."),
  keyboard: open("Sign in", { to: "today" }),
});

export { esc };
