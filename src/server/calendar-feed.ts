import { createHash, createHmac, randomBytes } from "node:crypto";
import { WEEKS, weekOf } from "@/core/semester";
import { eq, inArray } from "drizzle-orm";
import { CLASS_KIND_LABEL } from "@/core/agenda";
import { alarmsFor, classDescription, cleanAlarms, milestoneNote, type FeedAlarms } from "@/core/calendar-text";
import { describeFile } from "@/core/files";
import { icsCalendar, subscribeLinks, type IcsEvent, type SubscribeLinks } from "@/core/ics";
import { hashToken } from "@/core/link-tokens";
import { SITE_URL } from "@/core/links";
import { addDays, localDay } from "@/core/time";
import { db } from "@/lib/db";
import { calendarFeeds, lmsCourses, lmsFiles } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { fileOverridesMap, overlayAll } from "@/server/decisions";
import { academicEvents, LAYERS, type CalendarLayer } from "@/server/views/calendar";
import { classesBetween, type ClassView } from "@/server/views/classes";
import { syllabusTopic } from "@/server/views/lessons";
import { syllabiFor, termMilestones, termSpan, type PlacedMilestone } from "@/server/views/milestones";
import { deadlines, lessonSlots } from "@/server/views/shared";
import { loadStudent, type Student } from "@/server/views/student";

/**
 * A student's personal calendar feed, for Google Calendar, Apple Calendar,
 * Outlook or any app that subscribes by URL: /calendar/feed/<token>.ics. The
 * token is derived from a random nonce with a server secret, so it can be
 * shown again in Settings; the database holds only the nonce and the token's
 * HMAC (for the lookup), never the token. "Reset link" draws a new nonce: the
 * old URL 404s.
 *
 * The feed carries the layers set in Settings → Calendar, every layer until
 * the student changes them; the site itself always shows everything. A class
 * says its syllabus topic, a quiz the syllabus puts on it ("📝 Quiz 2 (10%) —
 * from the syllabus") and the lesson's files as links to their Press F pages.
 * Reminders (VALARM) follow "Reminders in your calendar". Built from Postgres
 * only (the sync snapshot and the sign-in cache).
 */

const TOKEN = /^[A-Za-z0-9_-]{32}$/;
const IDS = new Set<string>(LAYERS.map((l) => l.id));

function secret() {
  const key = env().CREDENTIAL_KEY;
  if (!key) throw new Error("CREDENTIAL_KEY is not set");
  return createHmac("sha256", key).update("calendar-feeds").digest("hex");
}

const tokenOf = (userId: string, nonce: string) => createHmac("sha256", secret()).update(`${userId}.${nonce}`).digest("base64url").slice(0, 32);
const fresh = (userId: string) => {
  const nonce = randomBytes(16).toString("base64url");
  return { nonce, hash: hashToken(tokenOf(userId, nonce), secret()) };
};

export const cleanLayers = (layers: unknown): CalendarLayer[] | null =>
  Array.isArray(layers) ? LAYERS.map((l) => l.id).filter((id) => layers.includes(id)) : null;

/** What a feed carries when the student never chose: everything, classes included. */
export const FEED_DEFAULT: CalendarLayer[] = LAYERS.map((l) => l.id);
/** The feed's layers from what is stored (null = never chosen → all). */
export const feedLayersOf = (stored: CalendarLayer[] | null) => stored ?? FEED_DEFAULT;

/** The student's feed (created on first use) and their saved feed layers (null = never chosen). */
export async function calendarFeed(userId: string): Promise<{ token: string; layers: CalendarLayer[] | null; alarms: FeedAlarms }> {
  let [row] = await db().select().from(calendarFeeds).where(eq(calendarFeeds.userId, userId));
  if (!row) {
    [row] = await db().insert(calendarFeeds).values({ userId, ...fresh(userId) }).onConflictDoNothing().returning();
    row ??= (await db().select().from(calendarFeeds).where(eq(calendarFeeds.userId, userId)))[0];
  }
  return { token: tokenOf(userId, row.nonce), layers: cleanLayers(row.layers), alarms: cleanAlarms(row.alarms) };
}

/** Settings → Calendar: each layer and whether the feed carries it (no feed is made here). */
export async function feedSettings(userId: string): Promise<Array<{ id: CalendarLayer; label: string; on: boolean }>> {
  return (await feedOptions(userId)).layers;
}

/** Settings → Calendar: the layers and the reminders, in one read. */
export async function feedOptions(userId: string): Promise<{ layers: Array<{ id: CalendarLayer; label: string; on: boolean }>; alarms: FeedAlarms }> {
  const [row] = await db().select({ layers: calendarFeeds.layers, alarms: calendarFeeds.alarms }).from(calendarFeeds).where(eq(calendarFeeds.userId, userId));
  const on = feedLayersOf(cleanLayers(row?.layers));
  return { layers: LAYERS.map((l) => ({ ...l, on: on.includes(l.id) })), alarms: cleanAlarms(row?.alarms) };
}

/** "Reset link": a new token; the old one stops working at once. Layers stay. */
export async function resetCalendarFeed(userId: string): Promise<string> {
  const next = fresh(userId);
  await db().insert(calendarFeeds).values({ userId, ...next })
    .onConflictDoUpdate({ target: calendarFeeds.userId, set: { ...next, updatedAt: new Date() } });
  return tokenOf(userId, next.nonce);
}

/** The layers the student's feed carries. */
export async function saveFeedLayers(userId: string, layers: readonly string[]) {
  const clean = LAYERS.map((l) => l.id).filter((id) => layers.includes(id) && IDS.has(id));
  await db().insert(calendarFeeds).values({ userId, ...fresh(userId), layers: clean })
    .onConflictDoUpdate({ target: calendarFeeds.userId, set: { layers: clean, updatedAt: new Date() } });
  return clean;
}

/** "Reminders in your calendar": minutes before classes (0 = off) and exam reminders. */
export async function saveFeedAlarms(userId: string, change: Partial<FeedAlarms>) {
  const current = (await calendarFeed(userId)).alarms;
  const next = cleanAlarms({ ...current, ...change });
  await db().update(calendarFeeds).set({ alarms: next, updatedAt: new Date() }).where(eq(calendarFeeds.userId, userId));
  return next;
}

export const feedPath = (token: string) => `/calendar/feed/${token}.ics`;

/** The calendar's name in every app: "Press F · Shams". */
export const feedName = (name: string | null | undefined) => {
  const first = firstName(name);
  return first ? `Press F · ${first}` : "Press F";
};

/** "Subscribe in your calendar" for a student's own feed: Google, Apple, Outlook and the link itself. */
export const personalSubscription = (token: string, name?: string | null): SubscribeLinks & { personal: true } => ({
  ...subscribeLinks(`${SITE_URL}${feedPath(token)}`, feedName(name), `${SITE_URL}/calendar/apple?feed=${token}`),
  personal: true,
});

/** /calendar/apple: where Safari is sent (webcal:// of one of our own feeds); null for a malformed token. */
export function appleRedirect(feed: string | null, site = SITE_URL) {
  const host = site.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!feed) return `webcal://${host}/calendar.ics`;
  return TOKEN.test(feed) ? `webcal://${host}${feedPath(feed)}` : null;
}

/** Whose feed a token opens; null for a malformed, unknown or reset token. */
export async function feedOwner(token: string): Promise<{ userId: string; layers: CalendarLayer[]; alarms: FeedAlarms } | null> {
  if (!TOKEN.test(token)) return null;
  const [row] = await db().select().from(calendarFeeds).where(eq(calendarFeeds.hash, hashToken(token, secret())));
  if (!row || tokenOf(row.userId, row.nonce) !== token) return null;
  return { userId: row.userId, layers: feedLayersOf(cleanLayers(row.layers)), alarms: cleanAlarms(row.alarms) };
}

const uid = (key: string) => `${createHash("sha256").update(key).digest("hex").slice(0, 24)}@pressf.chebarash.uz`;
function firstName(name: string | null | undefined) {
  return name?.trim().split(/\s+/)[0] ?? "";
}

/** How far back and ahead the feed reaches: two weeks of history, then the rest of the year. */
export const FEED_PAST_DAYS = 14;
export const FEED_AHEAD_DAYS = 150;

/**
 * The whole current semester, first week to last (a Google calendar should
 * show the term from start to end), and at least two weeks back and the
 * rest of the year ahead.
 */
export function feedRange(today: string, weeks = WEEKS) {
  const term = weekOf(today, weeks);
  const same = term ? weeks.filter((w) => w.term === term.term && Math.abs(Date.parse(w.starts) - Date.parse(today)) < 200 * 86_400_000) : [];
  const termStart = same.length ? same.reduce((a, w) => (w.starts < a ? w.starts : a), same[0].starts) : null;
  const termEnd = same.length ? addDays(same.reduce((a, w) => (w.ends > a ? w.ends : a), same[0].ends), 1) : null;
  const back = addDays(today, -FEED_PAST_DAYS);
  const ahead = addDays(today, FEED_AHEAD_DAYS);
  return { from: termStart && termStart < back ? termStart : back, to: termEnd && termEnd > ahead ? termEnd : ahead };
}

/** A gradebook or LMS lesson may be stamped a few minutes off the timetable slot. */
const SLACK_MS = 10 * 60_000;

/**
 * The files of each class's lesson, as { id, title } with the clean title:
 * by the class's own lesson ids, else the course's LMS lessons that fall in
 * the class's time (a weekly-pattern class has no id of its own).
 */
async function lessonFiles(classes: ClassView[]): Promise<Map<string, Array<{ id: string; title: string }>>> {
  const out = new Map<string, Array<{ id: string; title: string }>>();
  const regular = classes.filter((c) => c.kind !== "exam");
  if (!regular.length) return out;
  const needSlots = [...new Set(regular.filter((c) => !c.lessonIds.length && c.courseId).map((c) => c.courseId!))];
  const raws = needSlots.length ? await db().select({ id: lmsCourses.id, raw: lmsCourses.raw }).from(lmsCourses).where(inArray(lmsCourses.id, needSlots)) : [];
  const slots = new Map(raws.map((r) => [r.id, lessonSlots(r.raw)]));
  const ids = new Map<string, string[]>();
  for (const c of regular) {
    if (c.lessonIds.length) {
      ids.set(c.key, c.lessonIds.map(String));
      continue;
    }
    const from = Date.parse(c.start) - SLACK_MS;
    const to = Date.parse(c.end) + SLACK_MS;
    ids.set(c.key, [...new Set((slots.get(c.courseId ?? "") ?? []).filter((s) => Date.parse(s.at) >= from && Date.parse(s.at) < to).map((s) => String(s.lessonId)))]);
  }
  const all = [...new Set([...ids.values()].flat())];
  if (!all.length) return out;
  const [rows, overrides] = await Promise.all([
    db().select({ id: lmsFiles.id, name: lmsFiles.name, lessonId: lmsFiles.lessonId }).from(lmsFiles).where(inArray(lmsFiles.lessonId, all)),
    fileOverridesMap(),
  ]);
  for (const c of regular) {
    const own = new Set(ids.get(c.key) ?? []);
    const items = rows
      .filter((f) => f.lessonId && own.has(String(f.lessonId)))
      .map((f) => {
        const meta = describeFile(f.name, { courseCode: c.code, courseName: c.name });
        return { id: f.id, source: "lms", title: meta.title, type: meta.type, week: meta.week ?? null };
      });
    const shown = overlayAll(items, overrides).map((f) => ({ id: f.id, title: f.title }));
    if (shown.length) out.set(c.key, shown);
  }
  return out;
}

/** The syllabus week topics of each course (`topics_by_week`), for the class descriptions. */
async function weekTopics(codes: string[]): Promise<Map<string, Record<number, string>>> {
  const out = new Map<string, Record<number, string>>();
  for (const [code, data] of await syllabiFor(codes)) {
    const t: Record<number, string> = {};
    for (const w of data.topics_by_week ?? []) {
      const n = Number(String(w.week ?? "").match(/\d+/)?.[0]);
      if (n && !t[n] && w.topic) t[n] = w.topic;
    }
    out.set(code, t);
  }
  return out;
}

/** Every term the feed's range touches (usually one). A failure leaves milestones out, never the feed. */
async function feedMilestones(student: Student, from: string, to: string, now: Date, classes: ClassView[]): Promise<PlacedMilestone[]> {
  const starts = [...new Set([termSpan(from)?.from, termSpan(to)?.from].filter((x): x is string => !!x))];
  try {
    return (await Promise.all(starts.map((d) => termMilestones(student, d, now, classes)))).flat().filter((m) => m.endDay >= from && m.day <= to);
  } catch (error) {
    console.error("feed milestones failed", error instanceof Error ? error.message : error);
    return [];
  }
}

/** The .ics for a token, or null (→ 404). Never calls the LMS, never schedules a sync. */
export async function personalFeed(token: string, now = new Date()): Promise<string | null> {
  const owner = await feedOwner(token);
  if (!owner) return null;
  const student = await loadStudent(owner.userId, { refresh: false });
  if (!student) return null;
  const on = new Set(owner.layers);
  const alarms = owner.alarms;
  const today = localDay(now);
  const { from, to } = feedRange(today);
  const events: IcsEvent[] = [];

  const wantClasses = on.has("classes") || on.has("exams") || on.has("syllabus");
  const classes = wantClasses ? await classesBetween(student, from, to, now) : [];
  const codes = [...new Set(classes.map((c) => c.code).filter(Boolean))];
  const [milestones, files, topics] = await Promise.all([
    on.has("syllabus") ? feedMilestones(student, today, to, now, classes) : Promise.resolve([] as PlacedMilestone[]),
    on.has("classes") ? lessonFiles(classes).catch(() => new Map<string, Array<{ id: string; title: string }>>()) : Promise.resolve(new Map<string, Array<{ id: string; title: string }>>()),
    on.has("classes") && codes.length ? weekTopics(codes).catch(() => new Map<string, Record<number, string>>()) : Promise.resolve(new Map<string, Record<number, string>>()),
  ]);
  const onClass = new Map<string, PlacedMilestone[]>();
  for (const m of milestones) if (m.classKey) onClass.set(m.classKey, [...(onClass.get(m.classKey) ?? []), m]);
  const written = new Set<string>();

  for (const c of classes) {
    const exam = c.kind === "exam";
    if (!on.has(exam ? "exams" : "classes")) continue;
    written.add(c.key);
    const kind = CLASS_KIND_LABEL[c.kind];
    const ms = onClass.get(c.key) ?? [];
    const summary = `${ms.length ? "📝 " : ""}${exam ? `${c.name} ${c.exam?.kind ?? "exam"}` : `${c.name} · ${kind}`}`;
    events.push({
      uid: uid(`class:${c.key}`),
      summary,
      location: c.room,
      description: classDescription({
        head: [c.code, kind].filter(Boolean).join(" · "),
        room: c.room,
        teacher: c.teacher?.name ?? null,
        note: c.exam?.note ?? null,
        topic: exam ? null : syllabusTopic(topics.get(c.code), localDay(new Date(c.start))),
        milestones: ms,
        files: exam ? [] : files.get(c.key) ?? [],
        site: SITE_URL,
        courseHref: c.code ? `/c/${c.code}` : null,
      }),
      url: c.code ? `${SITE_URL}/c/${c.code}` : null,
      start: new Date(c.start), end: new Date(c.end),
      alarms: alarmsFor(exam ? "exam" : "class", alarms, summary, ms.length > 0),
    });
  }
  // Milestones with no class in the feed (a project due in week 12, or classes left out): all-day, in their own layer.
  for (const m of milestones.filter((x) => !x.classKey || !written.has(x.classKey))) {
    const summary = `📝 ${m.title} · ${m.courseName}`;
    events.push({
      uid: uid(m.id),
      summary,
      description: [
        milestoneNote(m).replace(", likely this lesson", m.day === m.endDay ? ", likely this day" : ", sometime this week"),
        m.source ? `Syllabus: ${m.source}` : null,
      ].filter(Boolean).join("\n"),
      url: m.courseCode ? `${SITE_URL}/c/${m.courseCode}` : null,
      day: m.day, endDay: m.endDay,
      alarms: alarmsFor("milestone-day", alarms, summary),
    });
  }
  if (on.has("deadlines")) {
    for (const d of deadlines(student.sync.homework)) {
      const day = localDay(d.due);
      if (day < from || day > to || d.status === "archived") continue;
      events.push({ uid: uid(`deadline:${d.id}`), summary: `Due: ${d.title}`, description: d.course || null, url: `${SITE_URL}/progress/assignments`, start: d.due, end: d.due });
    }
  }
  for (const e of await academicEvents(on, from, to)) {
    events.push({ uid: uid(e.key), summary: e.title, description: e.sub, url: e.href ? `${SITE_URL}${e.href}` : null, day: e.day, endDay: e.endDay });
  }

  return icsCalendar({ name: feedName(student.cache?.profile?.name), description: "Classes, exams, deadlines, syllabus quizzes and the academic calendar from Press F", events, now });
}
