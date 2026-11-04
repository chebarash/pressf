import { createHash } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, lte, notInArray, or, sql } from "drizzle-orm";
import {
  describeExam,
  examChanges,
  examKindOf,
  normCode,
  normStudentId,
  readSchedule,
  roomsLabel,
  SheetError,
  type ExamKind,
  type ExamWindowInput,
  type Mapping,
  type Normalised,
  type PlacedExam,
  type Tab,
} from "@/core/exams";
import { WEEKS, type WeekKind } from "@/core/semester";
import { addDays, localDay } from "@/core/time";
import { DEFAULT_ALERTS, type FeedItem } from "@/core/notifications";
import { db } from "@/lib/db";
import { examSeats, examSlots, examSources, examWindows, lmsAccounts, lmsCache, lmsCourses, userState, users } from "@/lib/db/schema";
import { currentUser } from "@/lib/lms/client";
import { studentIdOf } from "@/lib/lms/profile";
import { sessionFor } from "@/lib/lms/store";
import { fetchSheet, readUpload } from "@/lib/sheets";
import * as msg from "@/lib/telegram/messages";
import { deliver } from "@/server/sync/deliver";
import type { Alert } from "@/server/sync/convert";

/**
 * Exam schedules: sources (sheet links, uploads, operator JSON), the exam
 * windows they belong to, and each student's exams. Seats are kept only for
 * Press F students (matched by university ID); everyone else's rows are dropped
 * before anything is written. Views read `examsFor`, never the sheet.
 */

export class ExamError extends Error {}

/* ───────────── windows ───────────── */

export type ExamWindow = { key: string; kind: ExamKind; name: string; starts: string; ends: string; classes: "hide" | "show"; origin: "calendar" | "admin" };

const PHASE_NAME: Record<string, string> = { midterm: "Midterm exams", final: "Final exams" };

/** Midterm and final weeks of the published calendar (consecutive weeks merged). */
/** A Friday becomes the Saturday after it; other days stay. */
const throughSaturday = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() === 5 ? addDays(day, 1) : day);

export function calendarWindows(weeks = WEEKS): ExamWindow[] {
  const out: ExamWindow[] = [];
  for (const w of weeks.filter((x) => x.kind === "midterm" || x.kind === "final")) {
    const kind = w.kind as Extract<WeekKind, "midterm" | "final">;
    const last = out.at(-1);
    // The calendar lists weeks Mon–Fri; the Saturday is part of the exam week too.
    const ends = throughSaturday(w.ends);
    if (last && last.kind === kind && w.starts <= addDays(last.ends, 2)) last.ends = ends;
    else out.push({ key: `${kind}:${w.starts}`, kind, name: PHASE_NAME[kind], starts: w.starts, ends, classes: "hide", origin: "calendar" });
  }
  return out;
}

let memo: { at: number; list: ExamWindow[] } | null = null;
const MEMO_MS = 30_000;
const forget = () => { memo = null; };

/** Calendar exam weeks with the admin's overrides, plus admin-made windows. */
export async function examWindowList(): Promise<ExamWindow[]> {
  if (memo && Date.now() - memo.at < MEMO_MS && !process.env.VITEST) return memo.list;
  const rows = await db().select().from(examWindows);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const list: ExamWindow[] = calendarWindows().map((w) => {
    const o = byKey.get(w.key);
    return o ? { ...w, name: o.name, starts: o.starts, ends: o.ends, classes: o.classes, origin: "calendar" } : w;
  });
  for (const r of rows) if (!list.some((w) => w.key === r.key)) list.push({ key: r.key, kind: r.kind, name: r.name, starts: r.starts, ends: r.ends, classes: r.classes, origin: "admin" });
  list.sort((a, b) => a.starts.localeCompare(b.starts));
  memo = { at: Date.now(), list };
  return list;
}

/** Windows that hide regular classes and touch [from, to]. */
export const hidingWindows = (windows: ExamWindow[], from: string, to: string) => windows.filter((w) => w.classes === "hide" && w.starts <= to && w.ends >= from);

/** The window a schedule belongs to: an overlapping one (calendar or admin), else a new admin window. */
export async function windowFor(input: ExamWindowInput, actor: string | null = null): Promise<ExamWindow> {
  const kind = examKindOf(input.name);
  const list = await examWindowList();
  const hit = list.find((w) => w.starts <= input.ends && w.ends >= input.starts && (w.kind === kind || kind === "exam"));
  if (hit) return hit;
  const row = { key: `${kind}:${input.starts}`, kind, name: input.name, starts: input.starts, ends: input.ends, classes: "hide" as const, updatedBy: actor };
  await db().insert(examWindows).values(row).onConflictDoUpdate({ target: examWindows.key, set: { name: row.name, starts: row.starts, ends: row.ends } });
  forget();
  return { ...row, origin: "admin" };
}

/** Admin override of a window: hide or show regular classes, and its dates. */
export async function setWindow(key: string, patch: { classes?: "hide" | "show"; starts?: string; ends?: string; name?: string }, actor: string | null) {
  const current = (await examWindowList()).find((w) => w.key === key);
  if (!current) throw new ExamError("No such exam window");
  const next = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as ExamWindow;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next.starts) || !/^\d{4}-\d{2}-\d{2}$/.test(next.ends) || next.ends < next.starts) throw new ExamError("Dates must be YYYY-MM-DD, start before end");
  const row = { key, kind: next.kind, name: next.name, starts: next.starts, ends: next.ends, classes: next.classes, updatedBy: actor, updatedAt: new Date() };
  await db().insert(examWindows).values(row).onConflictDoUpdate({ target: examWindows.key, set: { name: row.name, starts: row.starts, ends: row.ends, classes: row.classes, updatedBy: actor, updatedAt: row.updatedAt } });
  forget();
}

/* ───────────── student IDs ───────────── */

/** Press F users by university student ID (from the LMS profile cached at sign-in). */
async function usersByStudentId(): Promise<Map<string, string>> {
  const rows = await db()
    .select({ userId: lmsCache.userId, id: sql<string | null>`${lmsCache.data}->'profile'->>'studentId'` })
    .from(lmsCache)
    .where(sql`${lmsCache.data}->'profile'->>'studentId' is not null`);
  const out = new Map<string, string>();
  for (const r of rows) if (r.id) out.set(normStudentId(r.id), r.userId);
  return out;
}

/**
 * Fills the student ID for synced students whose cached profile predates it:
 * one GET /users/current with their own session each, a few at a time.
 */
/** How long before a student whose LMS gave no student ID is asked again. */
const ID_RETRY_MS = 24 * 3600_000;

export async function backfillStudentIds(limit = 40, budgetMs = 60_000): Promise<{ checked: number; found: number }> {
  const until = Date.now() + budgetMs;
  const rows = await db()
    .select({ userId: lmsCache.userId })
    .from(lmsCache)
    .innerJoin(lmsAccounts, eq(lmsAccounts.userId, lmsCache.userId))
    .where(and(eq(lmsAccounts.status, "active"), sql`${lmsCache.data}->'profile' is not null and jsonb_typeof(${lmsCache.data}->'profile') = 'object'`, sql`(not (${lmsCache.data}->'profile' ? 'studentId') or (jsonb_typeof(${lmsCache.data}->'profile'->'studentId') = 'null' and coalesce(${lmsCache.data}->'profile'->>'studentIdCheckedAt', '') < ${new Date(Date.now() - ID_RETRY_MS).toISOString()}))`))
    .orderBy(sql`${lmsCache.data}->'profile'->>'studentIdCheckedAt' asc nulls first`)
    .limit(limit);
  let found = 0;
  for (const { userId } of rows) {
    if (Date.now() > until) break;
    const session = await sessionFor(userId).catch(() => null);
    const me = session ? await currentUser(session).catch(() => null) : null;
    if (!session || !me) continue;
    const id = studentIdOf(me);
    // An empty ID is retried a day later (the LMS fills external_id late), not given up on.
    await db().update(lmsCache).set({ data: sql`jsonb_set(jsonb_set(${lmsCache.data}, '{profile,studentId}', ${JSON.stringify(id)}::jsonb), '{profile,studentIdCheckedAt}', ${JSON.stringify(new Date().toISOString())}::jsonb)` }).where(eq(lmsCache.userId, userId));
    if (id) found++;
  }
  return { checked: rows.length, found };
}

/* ───────────── import ───────────── */

export type ImportStats = {
  exams: number;
  courses: number;
  coursesMatched: number;
  unmatched: string[];
  /** Seat rows in the sheet (all students), and how many distinct IDs. */
  seatRows: number;
  studentsInSheet: number;
  /** Press F students found by ID, and the seats kept for them. */
  usersMatched: number;
  seatsKept: number;
  changes: number;
  notified: number;
};

export type SourceInput = {
  key: string;
  label: string;
  url: string | null;
  origin: "sheet" | "upload" | "import";
  window: ExamWindowInput;
};

async function matchCourses(list: Array<{ code: string | null; name: string | null }>) {
  const codes = [...new Set(list.map((e) => e.code).filter((c): c is string => !!c).map(normCode))];
  const names = [...new Set(list.filter((e) => !e.code && e.name).map((e) => e.name!.toLowerCase()))];
  const rows = codes.length || names.length
    ? await db()
        .select({ id: lmsCourses.id, code: lmsCourses.code, name: lmsCourses.name })
        .from(lmsCourses)
        .where(or(codes.length ? inArray(sql`upper(replace(${lmsCourses.code}, ' ', ''))`, codes) : sql`false`, names.length ? inArray(sql`lower(${lmsCourses.name})`, names) : sql`false`))
    : [];
  const byCode = new Map<string, { id: string; code: string; name: string }>();
  const byName = new Map<string, { id: string; code: string; name: string }>();
  // Several LMS subjects can share a code (one per term): the highest id is the newest.
  for (const r of rows.sort((a, b) => Number(a.id) - Number(b.id))) {
    byCode.set(normCode(r.code), r);
    byName.set(r.name.toLowerCase(), r);
  }
  return (e: { code: string | null; name: string | null }) => (e.code ? byCode.get(normCode(e.code)) : e.name ? byName.get(e.name.toLowerCase()) : undefined) ?? null;
}

const examKey = (e: { code: string | null; name: string | null }) => (e.code ? normCode(e.code) : (e.name ?? "").trim()).slice(0, 100);

async function recipients(userIds: string[]) {
  if (!userIds.length) return new Map<string, { telegramId: string | null; alerts: typeof DEFAULT_ALERTS }>();
  const rows = await db().select({ id: users.id, telegramId: users.telegramId, alerts: userState.alerts }).from(users).leftJoin(userState, eq(userState.userId, users.id)).where(inArray(users.id, userIds));
  return new Map(rows.map((r) => [r.id, { telegramId: r.telegramId, alerts: { ...DEFAULT_ALERTS, ...(r.alerts ?? {}) } }]));
}

function changeAlert(sourceId: string, title: string, change: ReturnType<typeof examChanges>[number], now: Date, courseId: string | null): Alert {
  const what = change.what === "room" ? "Room changed" : change.what === "time" ? "Time changed" : "Exam moved";
  const nowText = describeExam(change.after);
  const wasText = change.what === "room" ? change.before.room ?? "no room" : describeExam(change.before);
  const item: FeedItem = {
    id: `exam-change:${sourceId}:${change.code}:${change.after.date}:${change.after.start}:${change.after.room ?? ""}`.slice(0, 200),
    kind: "system", title: `${what}: ${title}`, body: `${nowText} (was ${wasText})`, courseId: courseId ?? undefined, courseName: title,
    at: now, read: false, href: `/timetable?day=${change.after.date}`,
  };
  return { item, setting: "exams", message: msg.examChanged({ title: `${what}: ${title}`, now: nowText, was: wasText }) };
}

/**
 * Stores one source's schedule, replacing what it had: course-level exams for
 * everyone and seats for Press F students only. Students whose exam moved
 * (time or room) since the last import get one notice. Idempotent: the same
 * schedule again changes nothing and notifies no one.
 */
export async function importSchedule(input: SourceInput, data: Normalised, opts: { mapping?: Mapping | null; problems?: string[]; contentHash?: string | null; actor?: string | null; now?: Date } = {}): Promise<{ sourceId: string; stats: ImportStats }> {
  const now = opts.now ?? new Date();
  const window = await windowFor(input.window, opts.actor ?? null);
  const kind = examKindOf(input.window.name);
  const [source] = await db()
    .insert(examSources)
    .values({ key: input.key, label: input.label, url: input.url, origin: input.origin, windowKey: window.key, windowName: input.window.name, kind, starts: input.window.starts, ends: input.window.ends, createdBy: opts.actor ?? null })
    .onConflictDoUpdate({ target: examSources.key, set: { label: input.label, url: input.url, origin: input.origin, windowKey: window.key, windowName: input.window.name, kind, starts: input.window.starts, ends: input.window.ends, updatedAt: now } })
    .returning({ id: examSources.id });
  const sourceId = source.id;

  const courseOf = await matchCourses([...data.exams, ...data.seats]);
  // Students synced before IDs were kept get theirs first (a short budget), so their seats aren't dropped.
  if (data.seats.length) await backfillStudentIds(500, 20_000).catch(() => undefined);
  const ids = await usersByStudentId();

  // Course-level exams, one row per course and time.
  const slots = new Map<string, typeof examSlots.$inferInsert>();
  for (const e of data.exams) {
    const course = courseOf(e);
    const code = course ? normCode(course.code) : examKey(e);
    if (!code) continue;
    const key = `${code}|${e.date}|${e.start}`;
    const prev = slots.get(key);
    if (prev) {
      prev.rooms = [...new Set([...(prev.rooms ?? []), ...e.rooms])];
      prev.minutes = Math.max(prev.minutes, e.minutes);
      if (e.seats !== null) prev.seats = (prev.seats ?? 0) + e.seats;
      continue;
    }
    slots.set(key, { sourceId, code, courseId: course?.id ?? null, name: course?.name ?? e.name, day: e.date, start: e.start, minutes: e.minutes, rooms: [...new Set(e.rooms)], seats: e.seats });
  }

  // Seats: only Press F students; every other row is dropped here, unread further.
  const minutesOf = new Map([...slots.values()].map((s) => [`${s.code}|${s.day}|${s.start}`, s.minutes]));
  const seats = new Map<string, typeof examSeats.$inferInsert>();
  const inSheet = new Set<string>();
  for (const s of data.seats) {
    const sid = normStudentId(s.studentId);
    inSheet.add(sid);
    const userId = ids.get(sid);
    if (!userId) continue;
    const course = courseOf(s);
    const code = course ? normCode(course.code) : examKey(s);
    if (!code) continue;
    const minutes = s.minutes ?? minutesOf.get(`${code}|${s.date}|${s.start}`) ?? 120;
    seats.set(`${userId}|${code}|${s.date}|${s.start}`, { sourceId, userId, code, courseId: course?.id ?? null, name: course?.name ?? s.name, day: s.date, start: s.start, minutes, room: s.room });
  }

  // What students had before, to tell them what moved.
  const [oldSeats, oldSlots] = await Promise.all([
    db().select().from(examSeats).where(eq(examSeats.sourceId, sourceId)),
    db().select().from(examSlots).where(eq(examSlots.sourceId, sourceId)),
  ]);
  const placed = (r: { code: string; day: string; start: string; minutes: number; room: string | null }): PlacedExam => ({ code: r.code, date: r.day, start: r.start, minutes: r.minutes, room: r.room });
  const titleOf = new Map<string, { name: string; courseId: string | null }>();
  for (const s of [...slots.values(), ...seats.values()]) titleOf.set(s.code, { name: s.name ? `${s.code} ${s.name}` : s.code, courseId: s.courseId ?? null });

  const alertsFor = new Map<string, Alert[]>();
  const push = (userId: string, a: Alert) => alertsFor.set(userId, [...(alertsFor.get(userId) ?? []), a]);
  const today = localDay(now);
  let changes = 0;

  // Seat holders: their own seat moved.
  const seatUsers = new Set([...oldSeats.map((s) => s.userId), ...[...seats.values()].map((s) => s.userId)]);
  for (const userId of seatUsers) {
    const before = oldSeats.filter((s) => s.userId === userId).map(placed);
    const afterRows = [...seats.values()].filter((s) => s.userId === userId);
    const found = examChanges(before, afterRows.map((s) => placed({ ...s, room: s.room ?? null })));
    for (const c of found) {
      const row = afterRows.find((s) => s.code === c.code)!;
      row.was = c.what === "room" ? c.before.room : describeExam(c.before);
      changes++;
      if (c.after.date >= today) push(userId, changeAlert(sourceId, titleOf.get(c.code)?.name ?? c.code, c, now, row.courseId ?? null));
    }
    // A seat that didn't change keeps its earlier "moved from".
    for (const row of afterRows) if (!row.was) row.was = oldSeats.find((o) => o.userId === userId && o.code === row.code && o.day === row.day && o.start === row.start && (o.room ?? "") === (row.room ?? ""))?.was ?? null;
  }

  // Students of the course without a seat: the course's time moved.
  if (oldSlots.length) {
    const asPlaced = (r: { code: string; day: string; start: string; minutes: number }) => ({ code: r.code, date: r.day, start: r.start, minutes: r.minutes, room: null });
    const moved = examChanges(oldSlots.map(asPlaced), [...slots.values()].map((s) => asPlaced({ ...s, minutes: s.minutes })));
    if (moved.length) {
      const seated = new Set([...seats.values()].map((s) => s.userId));
      const codes = moved.map((m) => m.code);
      const enrolled = await db()
        .select({ userId: lmsCache.userId, codes: sql<string[]>`${lmsCache.data}->'enrollment'->'codes'` })
        .from(lmsCache)
        .where(sql`${lmsCache.data}->'enrollment'->'codes' ?| array[${sql.join(codes.map((c) => sql`${c}`), sql`, `)}]::text[]`);
      for (const m of moved) {
        changes++;
        if (m.after.date < today) continue;
        for (const r of enrolled) if (!seated.has(r.userId) && (r.codes ?? []).map(normCode).includes(m.code)) push(r.userId, changeAlert(sourceId, titleOf.get(m.code)?.name ?? m.code, m, now, titleOf.get(m.code)?.courseId ?? null));
      }
    }
  }

  await db().transaction(async (tx) => {
    await tx.delete(examSlots).where(eq(examSlots.sourceId, sourceId));
    await tx.delete(examSeats).where(eq(examSeats.sourceId, sourceId));
    const slotRows = [...slots.values()];
    for (let i = 0; i < slotRows.length; i += 500) await tx.insert(examSlots).values(slotRows.slice(i, i + 500));
    const seatRows = [...seats.values()];
    for (let i = 0; i < seatRows.length; i += 500) await tx.insert(examSeats).values(seatRows.slice(i, i + 500));
  });

  // Notices go out after the rows are stored (feed ids make a repeat a no-op).
  let notified = 0;
  if (alertsFor.size) {
    const to = await recipients([...alertsFor.keys()]);
    for (const [userId, alerts] of alertsFor) {
      const r = to.get(userId);
      if (!r) continue;
      notified += (await deliver({ userId, telegramId: r.telegramId, alerts: r.alerts }, alerts, now).catch(() => ({ sent: 0 }))).sent;
    }
  }

  const courseCodes = new Set([...slots.values()].map((s) => s.code));
  const matched = new Set([...slots.values()].filter((s) => s.courseId).map((s) => s.code));
  const stats: ImportStats = {
    exams: slots.size,
    courses: courseCodes.size,
    coursesMatched: matched.size,
    unmatched: [...courseCodes].filter((c) => !matched.has(c)).sort(),
    seatRows: data.seats.length,
    studentsInSheet: inSheet.size,
    usersMatched: new Set([...seats.values()].map((s) => s.userId)).size,
    seatsKept: seats.size,
    changes,
    notified,
  };
  await db().update(examSources).set({ status: "ok", error: null, stats, problems: opts.problems ?? [], mapping: opts.mapping ?? null, contentHash: opts.contentHash ?? null, importedAt: now, updatedAt: now }).where(eq(examSources.id, sourceId));
  return { sourceId, stats };
}

/* ───────────── sheets and uploads ───────────── */

const hashTabs = (tabs: Tab[]) => createHash("sha256").update(JSON.stringify(tabs)).digest("hex");

async function readAndImport(input: SourceInput, tabs: Tab[], opts: { actor?: string | null; force?: boolean; now?: Date }) {
  const [existing] = await db().select().from(examSources).where(eq(examSources.key, input.key));
  // A new Press F student with an ID re-reads an unchanged sheet: their seat was dropped before.
  const hash = `${hashTabs(tabs)}:${(await usersByStudentId()).size}`;
  if (existing && !opts.force && existing.status === "ok" && existing.contentHash === hash) {
    await db().update(examSources).set({ fetchedAt: opts.now ?? new Date() }).where(eq(examSources.id, existing.id));
    return { sourceId: existing.id, stats: existing.stats as ImportStats, unchanged: true };
  }
  const read = readSchedule(tabs, input.window, (existing?.mapping as Mapping | null) ?? null);
  const out = await importSchedule(input, read, { mapping: read.mapping, problems: [...read.problems, ...read.skipped.map((t) => `Tab "${t}" was not recognised`)], contentHash: hash, actor: opts.actor, now: opts.now });
  await db().update(examSources).set({ fetchedAt: opts.now ?? new Date() }).where(eq(examSources.id, out.sourceId));
  return { ...out, unchanged: false };
}

const checkWindow = (w: ExamWindowInput) => {
  if (!w.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(w.starts) || !/^\d{4}-\d{2}-\d{2}$/.test(w.ends) || w.ends < w.starts) throw new ExamError("Give the window a name and dates (YYYY-MM-DD, start before end)");
  if (addDays(w.starts, 31) < w.ends) throw new ExamError("An exam window is at most a month long");
};

async function failSource(input: SourceInput, error: string, actor: string | null) {
  const window = await windowFor(input.window, actor);
  await db()
    .insert(examSources)
    .values({ key: input.key, label: input.label, url: input.url, origin: input.origin, windowKey: window.key, windowName: input.window.name, kind: examKindOf(input.window.name), starts: input.window.starts, ends: input.window.ends, status: "error", error, createdBy: actor, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: examSources.key, set: { status: "error", error, fetchedAt: new Date(), updatedAt: new Date() } });
}

/** Adds (or re-reads) a Google Sheets link. A sheet the server can't open is saved with its error, to upload instead. */
export async function addSheet(url: string, label: string, window: ExamWindowInput, actor: string | null) {
  checkWindow(window);
  const clean = url.trim();
  const input: SourceInput = { key: clean.split("#")[0], label: label.trim() || window.name, url: clean, origin: "sheet", window };
  try {
    return await readAndImport(input, await fetchSheet(clean), { actor, force: true });
  } catch (e) {
    if (e instanceof SheetError) {
      await failSource(input, e.message, actor);
      throw new ExamError(e.message);
    }
    throw e;
  }
}

/**
 * Uploaded .xlsx/.csv/.html files (several CSV or HTML files are the tabs of one
 * sheet). With `url`, they stand in for that sheet (same source). Files are not kept.
 */
export async function addUpload(files: Array<{ name: string; bytes: Uint8Array }>, label: string, window: ExamWindowInput, actor: string | null, url?: string | null) {
  checkWindow(window);
  const key = url?.trim() ? url.trim().split("#")[0] : `upload:${(label.trim() || window.name).toLowerCase()}`;
  const input: SourceInput = { key, label: label.trim() || window.name, url: url?.trim() || null, origin: "upload", window };
  try {
    if (!files.length) throw new ExamError("Choose a file");
    return await readAndImport(input, files.flatMap((f) => readUpload(f.name, f.bytes)), { actor, force: true });
  } catch (e) {
    if (e instanceof SheetError) throw new ExamError(e.message);
    throw e;
  }
}

/** Re-reads a linked sheet; unchanged content does nothing. */
export async function refreshSource(id: string, opts: { force?: boolean; actor?: string | null; now?: Date } = {}) {
  const [s] = await db().select().from(examSources).where(eq(examSources.id, id));
  if (!s) throw new ExamError("No such source");
  if (!s.url) throw new ExamError("This source was uploaded or imported; upload or post it again to update it");
  const input: SourceInput = { key: s.key, label: s.label, url: s.url, origin: s.origin, window: { name: s.windowName, starts: s.starts, ends: s.ends } };
  try {
    return await readAndImport(input, await fetchSheet(s.url), opts);
  } catch (e) {
    const message = e instanceof SheetError || e instanceof ExamError ? e.message : "The sheet couldn't be read";
    await db().update(examSources).set({ status: "error", error: message, fetchedAt: opts.now ?? new Date() }).where(eq(examSources.id, id));
    if (e instanceof SheetError) throw new ExamError(e.message);
    throw e;
  }
}

/** Hourly: linked sheets whose window is upcoming (30 days) or running, and not read in the last 55 minutes. */
export async function refreshDueSources(now = new Date()) {
  const today = localDay(now);
  const due = await db()
    .select({ id: examSources.id, fetchedAt: examSources.fetchedAt })
    .from(examSources)
    .where(and(isNotNull(examSources.url), eq(examSources.origin, "sheet"), gte(examSources.ends, addDays(today, -1)), lte(examSources.starts, addDays(today, 30))));
  let refreshed = 0, failed = 0;
  for (const s of due) {
    if (s.fetchedAt && now.getTime() - s.fetchedAt.getTime() < 55 * 60_000) continue;
    try {
      await refreshSource(s.id, { now });
      refreshed++;
    } catch {
      failed++;
    }
  }
  const ids = await backfillStudentIds(20).catch(() => ({ checked: 0, found: 0 }));
  return { due: due.length, refreshed, failed, studentIds: ids.found };
}

export async function deleteSource(id: string) {
  await db().delete(examSources).where(eq(examSources.id, id));
}

/* ───────────── a student's exams ───────────── */

export type StudentExam = {
  key: string;
  sourceId: string;
  kind: ExamKind;
  window: string;
  code: string;
  courseId: string | null;
  name: string;
  start: Date;
  end: Date;
  /** The student's own room (matched by ID), else every room of the course's exam. */
  room: string | null;
  rooms: string[];
  /** "id": the student's seat from the university sheet; "course": the course's exam, rooms for everyone. */
  matched: "id" | "course";
  was: string | null;
};

const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:00`);

/**
 * The exams of one student in [fromDay, toDay]: their own seats where a source
 * lists them by ID, otherwise their courses' exams with all rooms.
 */
export async function examsFor(student: { userId: string; cache?: { enrollment?: { codes?: string[] } | null } | null; sync?: { courses?: Array<{ subjectId: string }> } }, fromDay: string, toDay: string): Promise<StudentExam[]> {
  const codes = [...new Set((student.cache?.enrollment?.codes ?? []).map(normCode))];
  const courseIds = [...new Set((student.sync?.courses ?? []).map((c) => c.subjectId))];
  const [mine, seatedIn] = await Promise.all([
    db()
      .select({ seat: examSeats, kind: examSources.kind, window: examSources.windowName })
      .from(examSeats)
      .innerJoin(examSources, eq(examSources.id, examSeats.sourceId))
      .where(and(eq(examSeats.userId, student.userId), gte(examSeats.day, fromDay), lte(examSeats.day, toDay))),
    db().selectDistinct({ id: examSeats.sourceId }).from(examSeats).where(eq(examSeats.userId, student.userId)),
  ]);
  const seated = seatedIn.map((r) => r.id);
  const ofCourses = codes.length || courseIds.length
    ? await db()
        .select({ slot: examSlots, kind: examSources.kind, window: examSources.windowName })
        .from(examSlots)
        .innerJoin(examSources, eq(examSources.id, examSlots.sourceId))
        .where(and(
          gte(examSlots.day, fromDay), lte(examSlots.day, toDay),
          or(codes.length ? inArray(examSlots.code, codes) : sql`false`, courseIds.length ? inArray(examSlots.courseId, courseIds) : sql`false`),
          seated.length ? notInArray(examSlots.sourceId, seated) : sql`true`,
        ))
    : [];
  const out: StudentExam[] = [];
  for (const { seat: s, kind, window } of mine) {
    const start = at(s.day, s.start);
    out.push({ key: `exam:${s.sourceId}:${s.code}:${s.day}:${s.start}`, sourceId: s.sourceId, kind, window, code: s.code, courseId: s.courseId, name: s.name ?? s.code, start, end: new Date(start.getTime() + s.minutes * 60_000), room: s.room, rooms: s.room ? [s.room] : [], matched: "id", was: s.was });
  }
  for (const { slot: s, kind, window } of ofCourses) {
    const start = at(s.day, s.start);
    const rooms = s.rooms ?? [];
    out.push({ key: `exam:${s.sourceId}:${s.code}:${s.day}:${s.start}`, sourceId: s.sourceId, kind, window, code: s.code, courseId: s.courseId, name: s.name ?? s.code, start, end: new Date(start.getTime() + s.minutes * 60_000), room: rooms.length === 1 ? rooms[0] : null, rooms, matched: "course", was: null });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** "MATH 106", or "Rooms: MATH 105–110" when the student's own room isn't known. */
export const examRoomText = (e: Pick<StudentExam, "room" | "rooms">) => e.room ?? (e.rooms.length ? `Rooms: ${roomsLabel(e.rooms)}` : null);

/** "Seat from the university sheet" / "Your room isn't listed yet: all rooms for this exam". */
export const examNote = (e: Pick<StudentExam, "matched" | "rooms" | "room">) =>
  e.matched === "id" ? "Your seat, from the university sheet" : e.room ? "Room from the university sheet" : e.rooms.length ? "From the university sheet; find your room on the list there" : "From the university sheet";

/** "No regular classes during midterm week" while a hiding window covers the day. */
export function examWeekNote(windows: ExamWindow[], day: string): string | null {
  const w = windows.find((x) => x.classes === "hide" && x.starts <= day && day <= x.ends);
  if (!w) return null;
  return `No regular classes during ${w.kind === "midterm" ? "midterm" : w.kind === "final" ? "final exam" : "exam"} week`;
}

/* ───────────── admin page ───────────── */

export async function examsAdmin(now = new Date()) {
  const [sources, windows, [ids]] = await Promise.all([
    db().select().from(examSources).orderBy(sql`${examSources.starts} desc`, sql`${examSources.createdAt} desc`),
    examWindowList(),
    // Seats are matched by student ID: how many active students have one.
    db()
      .select({ active: sql<number>`count(*)::int`, withId: sql<number>`count(*) filter (where coalesce(${lmsCache.data}->'profile'->>'studentId', '') <> '')::int` })
      .from(lmsAccounts)
      .leftJoin(lmsCache, eq(lmsCache.userId, lmsAccounts.userId))
      .where(eq(lmsAccounts.status, "active")),
  ]);
  const today = localDay(now);
  return {
    sources: sources.map((s) => ({
      id: s.id, label: s.label, url: s.url, origin: s.origin, window: s.windowName, windowKey: s.windowKey, starts: s.starts, ends: s.ends,
      status: s.status, error: s.error, problems: (s.problems ?? []).slice(0, 20), stats: s.stats as Partial<ImportStats>,
      fetchedAt: s.fetchedAt?.toISOString() ?? null, importedAt: s.importedAt?.toISOString() ?? null, layout: ((s.mapping as Mapping | null)?.tabs ?? []).map((t) => `${t.tab}: ${t.layout.replace("_", " ")}`),
    })),
    windows: windows.filter((w) => w.ends >= addDays(today, -60)).map((w) => ({ ...w, now: w.starts <= today && today <= w.ends })),
    students: { active: ids?.active ?? 0, withId: ids?.withId ?? 0 },
  };
}
