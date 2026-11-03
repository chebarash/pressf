import { and, eq, inArray } from "drizzle-orm";
import { describeFile } from "@/core/files";
import { addDays, localDay } from "@/core/time";
import { db } from "@/lib/db";
import { feedItems, lmsFiles, lmsSemesters } from "@/lib/db/schema";
import { preloadUser } from "@/lib/lms/cache";
import * as lms from "@/lib/lms/client";
import { filesAreStale, harvestCourseFiles } from "@/lib/lms/files";
import { parseSemesters, refreshCalendars, saveSemesters, upcomingSemesterIds } from "@/lib/lms/semesters";
import type { LmsGradebookSemester, LmsMyList } from "@/lib/lms/types";
import { sessionFor } from "@/lib/lms/store";
import { settingIsOn } from "@/server/decisions";
import { markRead, saveSnapshot } from "@/server/feed";
import { invalidateHarvest } from "@/server/views/cache";
import { coursesByIds } from "@/server/views/shared";
import { loadStudent } from "@/server/views/student";
import { absenceAlerts, announcementAlerts, fileAlert, gradeAlerts, gradebookCourses, historyAlerts, lmsNotifications, marksOf, roomAlerts, scheduleClasses, studiedSemesters, type Alert } from "./convert";
import { deliver, flushPending, remind, saveSent, sentKeys, type Recipient } from "./deliver";
import { syncStopped } from "@/lib/telegram/messages";
import { SNAPSHOT_KEY, SNAPSHOT_VERSION, termName, type SyncSnapshot, type SyncedCourse } from "./types";

/**
 * One student's sync: pull notifications, gradebook (marks and attendance),
 * assignments and the dated timetable from the LMS, store them for the views,
 * turn what changed into feed items and send the new ones to the bot.
 * Gentle on the LMS: sequential calls, past semesters at most daily, lesson
 * files for at most one course per run.
 */

export type SyncResult = { userId: string; ok: boolean; skipped?: "no-user" | "no-login" | "paused"; error?: string; alerts: number; sent: number };

/** The sign-in snapshot (enrollment, weekly timetable, profile) is refreshed this often by the sync. */
const CACHE_REFRESH_MS = 6 * 3600_000;
const PAST_REFRESH_MS = 24 * 3600_000;
const FILES_BUNDLE_MS = 3600_000;
const SCHEDULE_DAYS = 14;
const PAUSE_MS = 150;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs an LMS call; records a failure instead of throwing. */
async function attempt<T>(failures: string[], what: string, call: () => Promise<T>): Promise<T | null> {
  try {
    const out = await call();
    await sleep(PAUSE_MS);
    return out;
  } catch (error) {
    failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function syncStudent(userId: string, now = new Date()): Promise<SyncResult> {
  // An admin paused syncing (System): no LMS calls at all until it is turned back on.
  if (await settingIsOn("sync-paused")) return { userId, ok: true, skipped: "paused", alerts: 0, sent: 0 };
  const student = await loadStudent(userId, { refresh: false });
  if (!student) return { userId, ok: false, skipped: "no-user", alerts: 0, sent: 0 };
  const to: Recipient = { userId, telegramId: student.telegramId, alerts: student.alerts };
  const sent = await sentKeys(userId);

  const session = await sessionFor(userId).catch(() => null);
  if (!session) {
    // The saved password stopped working: tell the student once.
    if (student.account === "invalid" || (await loadStudent(userId, { refresh: false }))?.account === "invalid") {
      if (await remind(to, sent, "sync-stopped", "system", syncStopped(), now)) await saveSent(userId, sent, now);
    }
    return { userId, ok: false, skipped: "no-login", alerts: 0, sent: 0 };
  }
  if (sent["sync-stopped"]) delete sent["sync-stopped"];

  const prev = student.sync;
  const failures: string[] = [];
  const today = localDay(now);

  const payload = await attempt(failures, "notifications", () => lms.notifications(session));
  const semesterList = await attempt(failures, "semesters", () => lms.gradebookSemesters(session));
  // The gradebook list leaves out the first study year; my-list names every semester studied.
  const enrolled = semesterList ? await attempt(failures, "my-list", () => lms.myList(session)) : null;
  const semesters = semesterList ? await namedSemesters(semesterList, enrolled) : prev.semesters;
  const open = semesters.filter((s) => s.open);
  // Semester calendars (cohort selection, add/drop…) are shared: fetched once a day for everyone.
  if (semesterList) {
    const ids = await upcomingSemesterIds(open.map((s) => s.id)).catch(() => open.map((s) => s.id));
    await refreshCalendars(session, ids, now).catch(() => 0);
  }
  // A snapshot from before the real LMS shapes were known is re-pulled in full once.
  const upgrade = (prev.v ?? 1) < SNAPSHOT_VERSION;
  const pastDue = upgrade || !prev.pastAt || now.getTime() - Date.parse(prev.pastAt) > PAST_REFRESH_MS;
  const wanted = pastDue ? semesters : open;

  const fetched = new Map<string, SyncedCourse[]>();
  for (const s of wanted) {
    const data = await attempt(failures, `gradebook ${s.id}`, () => lms.gradebookData(session, s.id));
    if (data) fetched.set(s.id, gradebookCourses(data, s.id, s.open));
  }
  const courses = [
    ...semesters.flatMap((s) => fetched.get(s.id) ?? prev.courses.filter((c) => c.semesterId === s.id)),
  ];
  const homework = await attempt(failures, "homework", () => lms.homework(session, 1, 100));
  const from = addDays(today, -1);
  const toDay = addDays(today, SCHEDULE_DAYS);
  const days = await attempt(failures, "schedule", () =>
    lms.scheduleList(session, Math.floor(Date.parse(`${from}T00:00:00+05:00`) / 1000), Math.floor(Date.parse(`${toDay}T23:59:59+05:00`) / 1000)),
  );
  const schedule = days ? scheduleClasses(days, prev.schedule) : prev.schedule;

  const everythingFailed = !payload && !semesterList && !homework && !days;
  const named = await namer(courses.map((c) => c.subjectId));

  // Pull new lesson files for one stale course of this semester, then announce new ones.
  const openIds = new Set(open.map((s) => s.id));
  const currentIds = [...new Set(courses.filter((c) => openIds.has(c.semesterId)).map((c) => c.subjectId))];
  if (!everythingFailed) await pullOneCourse(session, currentIds);
  const fileAlerts = await newFiles(currentIds, prev, sent, now, named);

  const next: SyncSnapshot = {
    ...prev,
    at: everythingFailed ? prev.at : now.toISOString(),
    tried: now.toISOString(),
    error: everythingFailed ? failures[0] ?? "LMS not answering" : null,
    semesters,
    courses,
    homework: homework ?? prev.homework,
    schedule,
    scheduleWindow: days ? { from, to: toDay } : prev.scheduleWindow,
    marks: { ...prev.marks, ...marksOf(courses) },
    pastAt: pastDue && !failures.some((f) => f.startsWith("gradebook")) ? now.toISOString() : prev.pastAt,
    seenFiles: fileAlerts.seen,
    v: everythingFailed ? prev.v : SNAPSHOT_VERSION,
  };
  await saveSnapshot(userId, SNAPSHOT_KEY, next);

  // The sign-in snapshot (enrollment, weekly pattern, GPA) more rarely.
  const cacheAt = student.state.syncedAt;
  if (!everythingFailed && (!student.cache || !cacheAt || now.getTime() - Date.parse(cacheAt) > CACHE_REFRESH_MS)) {
    await preloadUser(userId, student.email).catch(() => null);
  }

  const alerts: Alert[] = [];
  const notes = lmsNotifications(payload);
  if (payload) {
    alerts.push(...announcementAlerts(notes));
    await syncReadState(userId, notes.filter((n) => n.read === true || n.read === 1 || n.read === "1").map((n) => `lms:${n.id}`));
  }
  const fresh = [...fetched.values()].flat();
  if (prev.at) {
    const known = new Set(prev.courses.map((c) => `${c.semesterId}|${c.subjectId}`));
    alerts.push(...gradeAlerts(prev.marks, fresh, now, named, known));
    alerts.push(...absenceAlerts(prev.courses, fresh, now, named));
    if (days && prev.schedule.length) alerts.push(...roomAlerts(schedule, prev.schedule, now, named));
  }
  alerts.push(...fileAlerts.alerts);
  // This semester's absences and grades so far, filed as already read the first
  // time a course is seen: the feed has the history, the bot stays quiet.
  const firstLook = fresh.filter((c) => openIds.has(c.semesterId) && (upgrade || !prev.courses.some((p) => p.semesterId === c.semesterId && p.subjectId === c.subjectId)));
  alerts.push(...historyAlerts(firstLook, now, named));

  const result = await deliver(to, alerts, now);
  const flushed = await flushPending(to, now);
  await saveSent(userId, sent, now);
  return { userId, ok: !everythingFailed, error: everythingFailed ? next.error ?? undefined : undefined, alerts: result.fresh, sent: result.sent + flushed };
}

/** Every semester studied, stored as shared names; a nameless one takes the harvested LMS name. */
async function namedSemesters(list: LmsGradebookSemester[], enrolled: LmsMyList | null) {
  await saveSemesters(parseSemesters(list)).catch(() => 0);
  const rows = studiedSemesters(list, enrolled);
  const unnamed = rows.filter((s) => /^Semester \d+$/.test(s.term)).map((s) => s.id);
  if (!unnamed.length) return rows;
  const known = await db().select({ id: lmsSemesters.id, name: lmsSemesters.name }).from(lmsSemesters).where(inArray(lmsSemesters.id, unnamed));
  const names = new Map(known.filter((k) => k.name).map((k) => [k.id, termName(k.name) || k.name!]));
  return rows.map((s) => (names.has(s.id) ? { ...s, term: names.get(s.id)! } : s));
}

async function namer(ids: string[]) {
  const refs = await coursesByIds(ids);
  return (id: string) => ({ name: refs.get(id)?.name ?? "Course", code: refs.get(id)?.code ?? "" });
}

/** Items the student already read in the LMS are read here too. */
async function syncReadState(userId: string, ids: string[]) {
  if (!ids.length) return;
  const unread = await db().select({ id: feedItems.id }).from(feedItems).where(and(eq(feedItems.userId, userId), eq(feedItems.read, false), inArray(feedItems.id, ids)));
  await markRead(userId, unread.map((r) => r.id));
}

async function pullOneCourse(session: lms.LmsSession, ids: string[]) {
  for (const id of ids) {
    if (!(await filesAreStale(id).catch(() => false))) continue;
    try {
      await harvestCourseFiles(session, id);
      const [ref] = (await coursesByIds([id])).values();
      if (ref) invalidateHarvest([ref.code]);
    } catch (error) {
      console.error("Course files pull failed", id, error instanceof Error ? error.message : error);
    }
    return;
  }
}

/** New LMS files per current course, bundled at most once an hour; the first sync only remembers. */
async function newFiles(ids: string[], prev: SyncSnapshot, sent: Record<string, string>, now: Date, named: (id: string) => { name: string; code: string }) {
  const rows = ids.length ? await db().select({ id: lmsFiles.id, courseId: lmsFiles.courseId, name: lmsFiles.name, code: lmsFiles.code }).from(lmsFiles).where(inArray(lmsFiles.courseId, ids)) : [];
  const seen = new Set(prev.seenFiles);
  const alerts: Alert[] = [];
  if (!prev.at) return { alerts, seen: [...new Set([...seen, ...rows.map((r) => r.id)])] };
  for (const id of ids) {
    const fresh = rows.filter((r) => r.courseId === id && !seen.has(r.id));
    if (!fresh.length) continue;
    const last = sent[`files:${id}`];
    if (last && now.getTime() - Date.parse(last) < FILES_BUNDLE_MS) continue;
    const course = named(id);
    alerts.push(fileAlert({ id, code: course.code || fresh[0].code, name: course.name }, fresh.map((f) => {
      const meta = describeFile(f.name, { courseCode: f.code, courseName: course.name });
      return { id: f.id, title: meta.title, week: meta.week };
    }), now));
    for (const f of fresh) seen.add(f.id);
    sent[`files:${id}`] = now.toISOString();
  }
  return { alerts, seen: [...seen] };
}
