import { createHash, createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { CLASS_KIND_LABEL } from "@/core/agenda";
import { googleSubscribeUrl, icsCalendar, type IcsEvent } from "@/core/ics";
import { hashToken } from "@/core/link-tokens";
import { SITE_URL } from "@/core/links";
import { addDays, localDay } from "@/core/time";
import { db } from "@/lib/db";
import { calendarFeeds } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { DEFAULT_LAYERS } from "@/screens/mobile/mc/format";
import { academicEvents, LAYERS, type CalendarLayer } from "@/server/views/calendar";
import { classesBetween } from "@/server/views/classes";
import { deadlines } from "@/server/views/shared";
import { loadStudent } from "@/server/views/student";

/**
 * A student's personal calendar feed, for Google Calendar (or any app that
 * subscribes by URL): /calendar/feed/<token>.ics. The token is derived from a
 * random nonce with a server secret, so it can be shown again on the Calendar
 * page; the database holds only the nonce and the token's HMAC (for the
 * lookup), never the token. "Reset link" draws a new nonce: the old URL 404s.
 *
 * The feed honours the layers the student picked on the Calendar page and is
 * built from Postgres only (the sync snapshot and the sign-in cache).
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

/** The student's feed (created on first use) and their saved layers (null = never chosen). */
export async function calendarFeed(userId: string): Promise<{ token: string; layers: CalendarLayer[] | null }> {
  let [row] = await db().select().from(calendarFeeds).where(eq(calendarFeeds.userId, userId));
  if (!row) {
    [row] = await db().insert(calendarFeeds).values({ userId, ...fresh(userId) }).onConflictDoNothing().returning();
    row ??= (await db().select().from(calendarFeeds).where(eq(calendarFeeds.userId, userId)))[0];
  }
  return { token: tokenOf(userId, row.nonce), layers: cleanLayers(row.layers) };
}

/** "Reset link": a new token; the old one stops working at once. Layers stay. */
export async function resetCalendarFeed(userId: string): Promise<string> {
  const next = fresh(userId);
  await db().insert(calendarFeeds).values({ userId, ...next })
    .onConflictDoUpdate({ target: calendarFeeds.userId, set: { ...next, updatedAt: new Date() } });
  return tokenOf(userId, next.nonce);
}

/** The layers chosen on the Calendar page, which the feed then shows. */
export async function saveCalendarLayers(userId: string, layers: readonly string[]) {
  const clean = LAYERS.map((l) => l.id).filter((id) => layers.includes(id) && IDS.has(id));
  await db().insert(calendarFeeds).values({ userId, ...fresh(userId), layers: clean })
    .onConflictDoUpdate({ target: calendarFeeds.userId, set: { layers: clean, updatedAt: new Date() } });
  return clean;
}

export const feedPath = (token: string) => `/calendar/feed/${token}.ics`;

/** The Calendar page's "Add to Google Calendar". */
export const personalSubscription = (token: string) => ({ google: googleSubscribeUrl(`${SITE_URL}${feedPath(token)}`), personal: true });

/** Whose feed a token opens; null for a malformed, unknown or reset token. */
export async function feedOwner(token: string): Promise<{ userId: string; layers: CalendarLayer[] } | null> {
  if (!TOKEN.test(token)) return null;
  const [row] = await db().select().from(calendarFeeds).where(eq(calendarFeeds.hash, hashToken(token, secret())));
  if (!row || tokenOf(row.userId, row.nonce) !== token) return null;
  return { userId: row.userId, layers: cleanLayers(row.layers) ?? DEFAULT_LAYERS };
}

const uid = (key: string) => `${createHash("sha256").update(key).digest("hex").slice(0, 24)}@pressf.chebarash.uz`;
const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] ?? "";

/** How far back and ahead the feed reaches: two weeks of history, then the rest of the year. */
export const FEED_PAST_DAYS = 14;
export const FEED_AHEAD_DAYS = 150;

/** The .ics for a token, or null (→ 404). Never calls the LMS, never schedules a sync. */
export async function personalFeed(token: string, now = new Date()): Promise<string | null> {
  const owner = await feedOwner(token);
  if (!owner) return null;
  const student = await loadStudent(owner.userId, { refresh: false });
  if (!student) return null;
  const on = new Set(owner.layers);
  const today = localDay(now);
  const from = addDays(today, -FEED_PAST_DAYS);
  const to = addDays(today, FEED_AHEAD_DAYS);
  const events: IcsEvent[] = [];

  if (on.has("classes") || on.has("exams")) {
    for (const c of await classesBetween(student, from, to, now)) {
      const exam = c.kind === "exam";
      if (!on.has(exam ? "exams" : "classes")) continue;
      const kind = CLASS_KIND_LABEL[c.kind];
      events.push({
        uid: uid(`class:${c.key}`),
        summary: exam ? `${c.name} exam` : `${c.name} · ${kind}`,
        location: c.room,
        description: [[c.code, kind].filter(Boolean).join(" · "), c.room ? `Room ${c.room}` : null, c.teacher ? c.teacher.name : null].filter(Boolean).join("\n"),
        url: c.code ? `${SITE_URL}/c/${c.code}` : null,
        start: new Date(c.start), end: new Date(c.end),
      });
    }
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

  const first = firstName(student.cache?.profile?.name);
  return icsCalendar({ name: first ? `Press F · ${first}` : "Press F", description: "Classes, exams, deadlines and the academic calendar from Press F", events, now });
}
