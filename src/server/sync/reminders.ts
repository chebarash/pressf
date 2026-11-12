import { attendanceEvents } from "@/core/attendance";
import { isQuiet } from "@/core/notifications";
import { nextPhase, dayInfo } from "@/core/semester";
import { addDays, clock, daysBetween, localDay, localMinutes, localWeekday, shortDate, weekdayName } from "@/core/time";
import { db } from "@/lib/db";
import { lmsFiles } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { describeFile } from "@/core/files";
import { classesBetween, type ClassView } from "@/server/views/classes";
import { rateQueueFor } from "@/server/views/rate";
import { deadlines, semesterPhases } from "@/server/views/shared";
import { loadStudent, type Student } from "@/server/views/student";
import { deadlineAlerts, milestoneAlerts } from "./convert";
import { byClass, termMilestones, type ClassMilestone } from "@/server/views/milestones";
import { lessonInfos, type LessonInfo } from "@/server/views/lessons";
import { syncWidget } from "./widget";
import { deliver, remind, saveSent, sentKeys, type Recipient } from "./deliver";
import * as msg from "@/lib/telegram/messages";
import type { BotMessage } from "@/lib/telegram/api";

/**
 * Time-based alerts, run every few minutes from cron: the 07:30 digest on
 * school days, 15 minutes before a class, the QR nudge 5 minutes into one,
 * deadlines 48 h and 3 h before, exams (Friday before the week, evening
 * before each), syllabus quizzes and deadlines (the evening before) and the
 * rating ask (after grades, every 3 days, at most 3 times).
 * Each goes out once per key; everything reads the stored snapshot only.
 */

const DIGEST_FROM = 7 * 60 + 30;
const DIGEST_UNTIL = 9 * 60;
const MIN = 60_000;

export type ReminderResult = { userId: string; sent: number };

/** Present for this class already (QR or the teacher), from the gradebook events. */
function checkedIn(student: Student, c: ClassView) {
  const course = student.sync.courses.find((x) => x.subjectId === c.courseId);
  if (!course) return false;
  const start = Date.parse(c.start);
  const end = Date.parse(c.end);
  return attendanceEvents(course.events).some((e) => e.at && e.at.getTime() >= start - 30 * MIN && e.at.getTime() <= end && (e.mark === "present" || e.mark === "late"));
}

export async function runReminders(userId: string, now = new Date()): Promise<ReminderResult> {
  const student = await loadStudent(userId, { refresh: false });
  if (!student || !student.telegramId || (!student.cache && !student.sync.at)) return { userId, sent: 0 };
  const to: Recipient = { userId, telegramId: student.telegramId, alerts: student.alerts };
  const sent = await sentKeys(userId);
  const day = localDay(now);
  const minutes = localMinutes(now);
  let count = 0;
  const go = async (key: string, setting: Parameters<typeof remind>[3], message: BotMessage) => {
    if (await remind(to, sent, key, setting, message, now)) count++;
  };
  // Lesson topics and syllabus quizzes for the digest and the widget; never worth failing a reminder over.
  const lessonsOf = (list: ClassView[]) => lessonInfos(student, list, now).catch(() => new Map<string, LessonInfo>());
  const milestonesOf = async (list: ClassView[]) => {
    try {
      const all = byClass(await termMilestones(student, day, now));
      return new Map([...all].filter(([key]) => list.some((c) => c.key === key)));
    } catch {
      return new Map<string, ClassMilestone[]>();
    }
  };

  const classes = await classesBetween(student, day, addDays(day, 7), now);
  const todays = classes.filter((c) => localDay(new Date(c.start)) === day);

  // Morning digest, school days only.
  const work = deadlines(student.sync.homework).filter((d) => d.status === "todo" || d.status === "in-progress");
  if (minutes >= DIGEST_FROM && minutes < DIGEST_UNTIL && dayInfo(now).studyDay && todays.length) {
    const tonight = work.filter((d) => localDay(d.due) === day && d.due > now).map((d) => ({ course: d.course, title: d.title, time: clock(d.due) }));
    if (!sent[`digest:${day}`]) {
      const infos = await lessonsOf(todays);
      const marks = await milestonesOf(todays);
      const rows = todays.map((c) => {
        const info = infos.get(c.key);
        return { time: c.time, course: c.name, room: c.room, topic: info?.title ?? info?.syllabus ?? null, marks: (marks.get(c.key) ?? []).map((m) => m.line) };
      });
      await go(`digest:${day}`, "digest", msg.morningDigest({ classes: rows, due: tonight.map((d) => `${d.course} ${d.title.charAt(0).toLowerCase()}${d.title.slice(1)}, ${d.time}`).join("; ") || null }));
    }
  }

  // The pinned "Today" widget: sent in the digest window, its data kept current after.
  try {
    const shown = classes.filter((c) => localDay(new Date(c.start)) <= addDays(day, 7));
    await syncWidget({ to, classes: shown, infos: await lessonsOf(shown), work, now, maySend: minutes >= DIGEST_FROM && minutes < 21 * 60 });
  } catch (error) {
    console.error("Today widget failed", error instanceof Error ? error.message : error);
  }

  // 15 minutes before each class, with this class's new materials if any.
  const soon = todays.filter((c) => Date.parse(c.start) - now.getTime() <= 15 * MIN && Date.parse(c.start) > now.getTime() && c.kind !== "exam");
  const lessonIds = soon.flatMap((c) => c.lessonIds);
  const materials = lessonIds.length ? await db().select({ lessonId: lmsFiles.lessonId, name: lmsFiles.name }).from(lmsFiles).where(inArray(lmsFiles.lessonId, lessonIds)) : [];
  for (const c of soon) {
    const files = materials.filter((m) => c.lessonIds.includes(m.lessonId ?? ""));
    const note = files.length === 1 ? `${describeFile(files[0].name, { courseCode: c.code, courseName: c.name }).title} is up` : files.length > 1 ? `${files.length} files are up` : null;
    await go(`class:${c.key}`, "classReminder", msg.classSoon({ course: c.name, courseCode: c.code || undefined, room: c.room, teacher: c.teacher?.name ?? null, note, start: new Date(c.start) }));
  }

  // 5 minutes into a class, if not checked in yet.
  for (const c of todays.filter((x) => now.getTime() - Date.parse(x.start) >= 5 * MIN && now.getTime() - Date.parse(x.start) < 20 * MIN && x.kind !== "exam")) {
    if (!checkedIn(student, c)) await go(`qr:${c.key}`, "qrReminder", msg.classStarted({ course: c.name }));
  }

  // Deadlines 48 h and 3 h before (feed items, so they show in the app too).
  const lastRun = sent["reminders:last"] ? new Date(sent["reminders:last"]) : new Date(now.getTime() - 15 * MIN);
  const due = deadlineAlerts(work, now, new Date(Math.max(lastRun.getTime(), now.getTime() - 60 * MIN)));
  if (due.length) count += (await deliver(to, due, now)).sent;

  // Exams: Friday afternoon before the week, and the evening before each.
  const phase = nextPhase(now, ["midterm", "final"]);
  if (phase && (phase.kind === "midterm" || phase.kind === "final") && localWeekday(now) === 5 && phase.inDays > 0 && phase.inDays <= 3 && minutes >= 16 * 60 && minutes < 20 * 60) {
    const exams = classes.filter((c) => c.kind === "exam" && localDay(new Date(c.start)) >= phase.starts)
      .map((c) => ({ day: `${weekdayName(new Date(c.start)).slice(0, 3)} ${shortDate(new Date(c.start))}`, time: c.time, name: c.name, room: c.room }));
    await go(`examweek:${phase.starts}`, "exams", msg.examWeek({ kind: phase.kind, exams: exams.map((e) => ({ when: `${e.day} ${e.time}`, course: e.name, room: e.room })) }));
  }
  if (minutes >= 18 * 60 && minutes < 21 * 60) {
    for (const c of classes.filter((x) => x.kind === "exam" && localDay(new Date(x.start)) === addDays(day, 1))) {
      const kind = c.exam?.kind ?? (/final/i.test(c.name) || phase?.kind === "final" ? "final" : /mid/i.test(c.name) || phase?.kind === "midterm" ? "midterm" : "exam");
      await go(`exam:${c.key}`, "exams", msg.examTomorrow({ course: c.name, courseCode: c.code, exam: kind, time: c.time, room: c.room }));
    }
  }

  // Syllabus quizzes, projects…: the evening before (feed items, so they show in the app too; once each).
  if (minutes >= 18 * 60 && minutes < 21 * 60 && to.alerts.syllabus !== false) {
    try {
      const exams = new Set(classes.filter((c) => c.kind === "exam").map((c) => c.key));
      const due = milestoneAlerts(await termMilestones(student, addDays(day, 1), now), day, now, exams);
      if (due.length) count += (await deliver(to, due, now)).sent;
    } catch (error) {
      console.error("syllabus reminders failed", error instanceof Error ? error.message : error);
    }
  }

  // An hour before each exam (never in quiet hours).
  if (!isQuiet(minutes)) {
    for (const c of todays.filter((x) => x.kind === "exam" && Date.parse(x.start) > now.getTime() && Date.parse(x.start) - now.getTime() <= 60 * MIN)) {
      const kind = c.exam?.kind ?? "exam";
      await go(`examsoon:${c.key}`, "exams", msg.examSoon({ course: c.name, exam: kind === "exam" ? "exam" : kind, time: c.time, room: c.room }));
    }
  }

  // Break starts.
  const info = dayInfo(now);
  if (info.week?.kind === "break" && minutes >= 9 * 60 && minutes < 13 * 60) {
    const br = nextPhase(now, ["break"]);
    if (br && br.starts <= day) {
      const after = nextPhase(new Date(Date.parse(`${addDays(br.ends, 1)}T12:00:00+05:00`)), ["teaching", "final", "midterm"]);
      const finals = nextPhase(now, ["final"]);
      const next = [after ? `${after.kind === "teaching" ? "Classes" : after.title} start ${shortDate(after.starts)}` : null, finals ? `finals ${shortDate(finals.starts)}–${shortDate(finals.ends)}` : null].filter(Boolean).join(", ");
      await go(`break:${br.starts}`, "system", msg.breakStarts({ name: Number(br.starts.slice(5, 7)) >= 11 || Number(br.starts.slice(5, 7)) <= 2 ? "Winter break" : "Break", until: shortDate(addDays(br.ends, 1)), note: next || null }));
    }
  }

  // Semester calendar from the LMS: cohort selection 3 days ahead, add/drop the day before it closes.
  if (minutes >= 10 * 60 && minutes < 20 * 60) {
    for (const p of await semesterPhases(day)) {
      if (p.kind === "cohort-selection") {
        const inDays = daysBetween(day, p.startDay);
        if (inDays < 1 || inDays > 3) continue;
        const when = inDays === 1 ? "tomorrow" : `on ${weekdayName(p.startDay)} ${shortDate(p.startDay)}`;
        await go(`cohort:${p.semesterId}:${p.startDay}`, "registration", msg.cohortSelection({ when, target: { to: "next" } }));
      }
      if (p.kind === "add-drop" && p.endDay === addDays(day, 1)) {
        const end = new Date(p.ends);
        const time = clock(end);
        await go(`adddrop:${p.semesterId}:${p.endDay}`, "registration", msg.addDropCloses({ when: time === "00:00" ? "tomorrow" : `tomorrow ${time}`, term: p.semester ?? "next semester" }));
      }
    }
  }

  // Rating ask: after the semester's grades, then every 3 days, at most 3 times, in the daytime.
  if (minutes >= 10 * 60 && minutes < 20 * 60) {
    const queue = await rateQueueFor(student, now);
    const term = queue.ask.term;
    const ended = term ? student.sync.semesters.find((s) => s.term === term)?.ends : null;
    if (term && queue.ask.waiting.length && (!ended || ended.slice(0, 10) <= day)) {
      const key = `rating:${term}`;
      const [n, last] = (sent[key] ?? "0|").split("|");
      const times = Number(n) || 0;
      if (times < 3 && (!last || now.getTime() - Date.parse(last) >= 3 * 86_400_000) && to.alerts.rating !== false) {
        const tmp: Record<string, string> = {};
        if (await remind(to, tmp, key, "rating", msg.rateAsk({ term, courses: queue.ask.waiting.length }), now)) {
          sent[key] = `${times + 1}|${now.toISOString()}`;
          count++;
        }
      }
    }
  }

  sent["reminders:last"] = now.toISOString();
  await saveSent(userId, sent, now);
  return { userId, sent: count };
}
